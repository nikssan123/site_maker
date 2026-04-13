import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index';
import { autoFix } from '../services/fixerService';
import { runProject } from '../services/appRunner';
import { deriveAdminToken } from '../lib/adminToken';
import { triggerEmailEvent } from '../services/emailEvents';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const now = () => new Date();

/**
 * In-memory cache for Caddy on_demand_tls domain validation.
 * Prevents DB queries on every TLS handshake for known domains.
 * Caches both positive (verified) and negative (unknown) results.
 */
const domainAskCache = new Map<string, { allowed: boolean; expiresAt: number }>();
const CACHE_TTL_OK = 5 * 60_000;    // 5 min for verified domains
const CACHE_TTL_DENY = 60_000;       // 1 min for rejected (shorter so new verifications propagate fast)
const CACHE_MAX_SIZE = 10_000;        // prevent unbounded growth from enumeration attacks
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function requireInternalSecret(req: { header: (name: string) => string | undefined }) {
  const secret = (process.env.INTERNAL_SECRET ?? '').trim();
  if (!secret) return; // allow in dev if not set
  const got = String(req.header('x-internal-secret') ?? '').trim();
  if (!got || got !== secret) throw new AppError(401, 'Unauthorized');
}

/**
 * Resolve a verified custom domain to its project ID.
 * Used by app-runner to route custom-domain traffic without DB access.
 * Internal-only — only reachable inside the Docker network, never exposed to the internet.
 */
router.get('/resolve-domain', async (req, res) => {
  requireInternalSecret(req);
  const host = String(req.query.host ?? '').toLowerCase().trim();
  if (!host) return res.status(400).json({ error: 'host required' });

  const project = await prisma.project.findFirst({
    where: {
      customDomain: host,
      customDomainVerifiedAt: { not: null },
      OR: [
        // Legacy / explicit flag used by billing flows
        { hosted: true },
        // Active paid hosting
        { hostingSubscriptionId: { not: null } },
        // Active free hosting window (bundled with site purchase, promos, etc.)
        { hostingFreeUntil: { gt: now() } },
      ],
    },
    select: { id: true },
  });

  if (!project) return res.status(404).json({ error: 'not found' });
  return res.json({ projectId: project.id });
});

/**
 * Caddy on_demand_tls validation endpoint.
 * Caddy sends GET /api/internal/caddy-ask?domain=example.com before issuing a cert.
 * Return 200 to allow, non-200 to deny.
 * Unauthenticated intentionally — Caddy cannot send custom headers in `ask` requests.
 * Safe because port 4000 is Docker-internal only (never exposed to the internet).
 */
router.get('/caddy-ask', async (req, res) => {
  const domain = String(req.query.domain ?? '').toLowerCase().trim();

  // Reject empty or malformed domains before touching DB
  if (!domain || domain.length > 253 || !DOMAIN_RE.test(domain)) {
    return res.status(400).json({ error: 'invalid domain' });
  }

  // Check cache first
  const cached = domainAskCache.get(domain);
  if (cached && Date.now() < cached.expiresAt) {
    return res.status(cached.allowed ? 200 : 404).json(
      cached.allowed ? { ok: true } : { error: 'not found' }
    );
  }

  const project = await prisma.project.findFirst({
    where: {
      customDomain: domain,
      customDomainVerifiedAt: { not: null },
      OR: [
        { hosted: true },
        { hostingSubscriptionId: { not: null } },
        { hostingFreeUntil: { gt: now() } },
      ],
    },
    select: { id: true },
  });

  const allowed = !!project;

  // Evict oldest entries if cache grows too large (protection against enumeration)
  if (domainAskCache.size >= CACHE_MAX_SIZE) {
    const firstKey = domainAskCache.keys().next().value;
    if (firstKey) domainAskCache.delete(firstKey);
  }

  domainAskCache.set(domain, {
    allowed,
    expiresAt: Date.now() + (allowed ? CACHE_TTL_OK : CACHE_TTL_DENY),
  });

  if (!project) return res.status(404).json({ error: 'not found' });
  return res.status(200).json({ ok: true });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Derived admin token for app-runner (catalog PUT/DELETE gate). Docker-internal only.
 */
router.get('/admin-token/:projectId', async (req, res) => {
  requireInternalSecret(req);
  const projectId = String(req.params.projectId ?? '');
  if (!UUID_RE.test(projectId)) return res.status(400).json({ error: 'invalid project id' });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return res.status(404).json({ error: 'not found' });

  try {
    const token = deriveAdminToken(projectId);
    return res.json({ token });
  } catch {
    return res.status(500).json({ error: 'token derivation failed' });
  }
});

/**
 * Auto-fix a crashing server.js using Claude.
 * Called by app-runner when a full-stack preview fails to start.
 * Internal-only — never exposed to the internet.
 */
router.post('/fix-run', async (req, res) => {
  try {
    requireInternalSecret(req);
    const { projectId, errorLog } = z
      .object({ projectId: z.string(), errorLog: z.string() })
      .parse(req.body);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, files: true, fixAttempts: true },
    });
    if (!project) return res.status(404).json({ error: 'project not found' });

    const rawFiles = project.files as Record<string, unknown> | null;
    if (!rawFiles || typeof rawFiles !== 'object') {
      return res.status(400).json({ error: 'no files in project' });
    }

    const files: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawFiles)) {
      if (typeof v === 'string') files[k] = v;
    }

    console.log(`[internal/fix-run] fixing server.js for ${projectId}, error: ${errorLog.slice(0, 200)}`);

    const result = await autoFix({
      projectId,
      files,
      failedStep: 'run',
      errorLog,
      onAttempt: (attempt) => {
        console.log(`[internal/fix-run] ${projectId} attempt ${attempt}`);
      },
    });

    console.log(`[internal/fix-run] ${projectId} result: success=${result.success}`);
    return res.json({ success: result.success, log: result.log, port: result.port ?? 0 });
  } catch (err: unknown) {
    console.error('[internal/fix-run] error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

/**
 * Trigger a project email event (called by generated server.js).
 * Internal-only — never exposed to the internet.
 */
router.post('/project-email', async (req, res) => {
  try {
    requireInternalSecret(req);
    const { projectId, eventType, data } = z
      .object({
        projectId: z.string(),
        eventType: z.string(),
        data: z.record(z.string()).default({}),
      })
      .parse(req.body);

    await triggerEmailEvent(projectId, eventType, data);
    return res.json({ ok: true });
  } catch (err: unknown) {
    console.error('[internal/project-email] error:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

export default router;
