import { Router } from 'express';
import { z } from 'zod';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../middleware/requireAuth';
import { streamProjectZip } from '../lib/zipBuilder';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { allowUnpaidProjectDownload } from '../lib/devFlags';
import { ensureRunning, startPersistentHosting, stopProject, buildProject, runProject } from '../services/appRunner';
import { encrypt, decrypt } from '../lib/encryption';
import { projectPath } from '../lib/fileWriter';
import { deriveAdminToken, writeAdminTokenFile } from '../lib/adminToken';
import { FREE_ITERATION_LIMIT } from './iterate';
import { isHostingActive } from '../lib/hostingActive';

const EDIT_TOKEN_TTL_MS = 3_600_000; // 1 hour

function signEditToken(projectId: string): string {
  const expires = Date.now() + EDIT_TOKEN_TTL_MS;
  const payload = `${projectId}:${expires}`;
  const sig = createHmac('sha256', process.env.JWT_SECRET!).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

function verifyEditToken(token: string, projectId: string): void {
  const parts = token.split(':');
  if (parts.length !== 3) throw new AppError(403, 'Invalid token');
  const [tid, expiresStr, sig] = parts;
  if (tid !== projectId) throw new AppError(403, 'Invalid token');
  if (sig.length !== 64) throw new AppError(403, 'Invalid token');
  if (Date.now() > Number(expiresStr)) throw new AppError(403, 'Token expired');
  const expected = createHmac('sha256', process.env.JWT_SECRET!).update(`${tid}:${expiresStr}`).digest('hex');
  if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new AppError(403, 'Invalid token signature');
  }
}

/**
 * Walk all source files in the project, skipping build artifacts and dependencies.
 * Searches the entire project tree so text in data/, locales/, public/, etc. is also found.
 */
function walkSourceFiles(projectDir: string): string[] {
  const SKIP = new Set(['node_modules', 'dist', '.git', '.vite', 'coverage', '.pnpm']);
  const results: string[] = [];
  const stack = [projectDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (/\.(tsx?|jsx?|html|css|json|md)$/i.test(entry.name)) {
        results.push(full);
      }
    }
  }
  return results;
}

import {
  validateUserHostname,
  newVerificationToken,
  cnameTargetForProject,
  hostingSitesConfigured,
  challengeTxtName,
  challengeTxtExpectedValue,
  verifyTxtChallenge,
  verifyCnamePointsToProject,
} from '../lib/customDomainHosting';

interface AdminField { name: string; type: string; }
interface AdminModel { name: string; fields: AdminField[] | null; }
interface AdminConfig { appType: string | null; models: AdminModel[]; }

function inferFieldType(field: string): string {
  const f = field.toLowerCase();
  if (/url|image|img|photo|pic|avatar|thumbnail|cover|banner|logo|picture|poster/.test(f)) return 'image';
  if (/price|cost|amount|rating|count|stock|qty|quantity|seats|year|mileage|duration|age|weight/.test(f)) return 'number';
  if (/date|createdat|updatedat|birthday|scheduledat/.test(f)) return 'date';
  if (/description|content|notes|bio|body|details|summary|message|text/.test(f)) return 'textarea';
  if (/link|href|website|profile/.test(f)) return 'url';
  return 'text';
}

/** Read __admin_config.json if present, otherwise fall back to regex-parsing server.js. */
function getAdminConfig(projectId: string): AdminConfig {
  const dir = projectPath(projectId);

  // Prefer the structured config written by the generator
  const configFile = path.join(dir, '__admin_config.json');
  if (fs.existsSync(configFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return {
        appType: typeof raw.appType === 'string' ? raw.appType : null,
        models: Array.isArray(raw.models) ? raw.models : [],
      };
    } catch { /* fall through */ }
  }

  // Legacy fallback: parse server.js for GET /api/<model> routes
  const serverFile = path.join(dir, 'server.js');
  if (!fs.existsSync(serverFile)) return { appType: null, models: [] };
  const content = fs.readFileSync(serverFile, 'utf8');
  const regex = /(?:app|router)\.get\s*\(\s*['"`]\/api\/([a-zA-Z][a-zA-Z0-9_-]*)['"`]/g;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return { appType: null, models: names.map((name) => ({ name, fields: null })) };
}

function applyContentPatch(projectId: string, original: string, replacement: string): void {
  const projectDir = projectPath(projectId);
  const files = walkSourceFiles(projectDir);

  // Never patch server.js via edit mode (too easy to break runtime JS strings).
  // If the requested "original" exists only there, we fail with a clear message.
  const serverFile = path.join(projectDir, 'server.js');
  const serverContent = fs.existsSync(serverFile) ? fs.readFileSync(serverFile, 'utf8') : null;
  const serverHasOriginal = Boolean(serverContent && serverContent.includes(original));

  const patchableFiles = files.filter((f) => path.basename(f).toLowerCase() !== 'server.js');

  // Pass 1 — exact match
  for (const file of patchableFiles) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes(original)) {
      fs.writeFileSync(file, content.replace(original, replacement), 'utf8');
      return;
    }
  }

  // Pass 2 — whitespace-flexible match (handles JSX indentation / innerText normalisation)
  const norm = original.replace(/\s+/g, ' ').trim();
  if (norm.length > 0) {
    const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flexRegex = new RegExp(escaped.replace(/ /g, '\\s+'));
    for (const file of patchableFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const m = flexRegex.exec(content);
      if (m) {
        fs.writeFileSync(file, content.replace(m[0], replacement), 'utf8');
        return;
      }
    }
  }

  if (serverHasOriginal) {
    throw new AppError(
      409,
      'Този текст се намира само в server.js и не може да бъде редактиран в Edit Mode (за да не се чупи бекендът). ' +
      'Променете съдържанието през Iteration/чат или преместете данните в отделен JSON/контент файл.',
    );
  }

  throw new AppError(404, 'Original text not found in any source file');
}

const router = Router();

function customDomainPayload(project: {
  id: string;
  customDomain: string | null;
  customDomainVerifiedAt: Date | null;
  domainVerificationToken: string | null;
}) {
  const token = project.domainVerificationToken;
  const cnameTarget = cnameTargetForProject(project.id);
  const pending = Boolean(project.customDomain && token && !project.customDomainVerifiedAt);
  return {
    customDomain: project.customDomain,
    customDomainVerifiedAt: project.customDomainVerifiedAt?.toISOString() ?? null,
    hostingSitesConfigured: hostingSitesConfigured(),
    cnameTarget,
    challengeTxtName: pending && project.customDomain ? challengeTxtName(project.customDomain) : null,
    challengeTxtValue: pending && token ? challengeTxtExpectedValue(token) : null,
  };
}

function firstPartyRootDomain(): string | null {
  const raw = (process.env.FIRST_PARTY_ROOT_DOMAIN ?? '').trim().toLowerCase();
  return raw.length > 0 ? raw : null;
}

function validateSubdomainSlug(raw: string): { ok: true; slug: string } | { ok: false; error: string } {
  const slug = raw.trim().toLowerCase();
  if (!slug) return { ok: false, error: 'Въведете име (поддомейн)' };
  if (slug.length < 3) return { ok: false, error: 'Името трябва да е поне 3 символа' };
  if (slug.length > 40) return { ok: false, error: 'Името е твърде дълго' };
  if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: 'Използвайте само латински букви, цифри и тирета' };
  if (slug.startsWith('-') || slug.endsWith('-')) return { ok: false, error: 'Името не може да започва/завършва с тире' };
  return { ok: true, slug };
}

// First-party subdomain (e.g. mysite.website.com) — hosted projects only
router.put('/:projectId/subdomain', requireAuth, async (req, res, next) => {
  try {
    const root = firstPartyRootDomain();
    if (!root) throw new AppError(400, 'FIRST_PARTY_ROOT_DOMAIN is not configured on the server');

    const projectId = String(req.params.projectId);
    const { slug: rawSlug } = z.object({ slug: z.string() }).parse(req.body);
    const parsed = validateSubdomainSlug(rawSlug);
    if (!parsed.ok) throw new AppError(400, parsed.error);

    const hostname = `${parsed.slug}.${root}`;

    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!isHostingActive(project) || !project.paid) {
      throw new AppError(403, 'Subdomains are available for hosted projects');
    }

    const taken = await prisma.project.findFirst({
      where: { customDomain: hostname, NOT: { id: project.id } },
      select: { id: true },
    });
    if (taken) throw new AppError(409, 'Това име вече е заето');

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        customDomain: hostname,
        customDomainVerifiedAt: new Date(), // our own domain — no DNS verification needed
        domainVerificationToken: null,
      },
    });

    return res.json(customDomainPayload(updated));
  } catch (err) {
    return next(err);
  }
});

// BYO custom domain (hosted projects)
router.get('/:projectId/custom-domain', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!isHostingActive(project) || !project.paid) {
      throw new AppError(403, 'Custom domains are available for hosted projects');
    }
    return res.json(customDomainPayload(project));
  } catch (err) {
    return next(err);
  }
});

router.put('/:projectId/custom-domain', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const { customDomain: raw } = z.object({ customDomain: z.string() }).parse(req.body);
    const parsed = validateUserHostname(raw);
    if (!parsed.ok) throw new AppError(400, parsed.error);

    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!isHostingActive(project) || !project.paid) {
      throw new AppError(403, 'Custom domains are available for hosted projects');
    }

    const taken = await prisma.project.findFirst({
      where: {
        customDomain: parsed.hostname,
        NOT: { id: project.id },
      },
    });
    if (taken) throw new AppError(409, 'That domain is already connected to another project');

    const token =
      project.customDomain === parsed.hostname && project.domainVerificationToken
        ? project.domainVerificationToken
        : newVerificationToken();

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        customDomain: parsed.hostname,
        domainVerificationToken: token,
        customDomainVerifiedAt:
          project.customDomain === parsed.hostname ? project.customDomainVerifiedAt : null,
      },
    });

    return res.json(customDomainPayload(updated));
  } catch (err) {
    return next(err);
  }
});

router.post('/:projectId/custom-domain/verify', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!isHostingActive(project) || !project.paid) {
      throw new AppError(403, 'Custom domains are available for hosted projects');
    }
    if (!project.customDomain || !project.domainVerificationToken) {
      throw new AppError(400, 'Save a domain name first');
    }

    const token = project.domainVerificationToken;
    const host = project.customDomain;

    const txtOk = await verifyTxtChallenge(host, token);
    const needCname = hostingSitesConfigured();
    const cnameOk = needCname ? await verifyCnamePointsToProject(host, project.id) : true;

    if (!txtOk || !cnameOk) {
      return res.status(400).json({
        ok: false,
        txtRecordOk: txtOk,
        cnameOk: needCname ? cnameOk : null,
        message: needCname
          ? 'DNS checks failed. Confirm TXT and CNAME records, then wait a few minutes for propagation.'
          : 'TXT record not found yet. After it verifies, set HOSTING_SITES_HOST on the server and add the CNAME to finish routing.',
      });
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { customDomainVerifiedAt: new Date() },
    });

    return res.json({ ok: true, ...customDomainPayload(updated) });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:projectId/custom-domain', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    if (!isHostingActive(project) || !project.paid) {
      throw new AppError(403, 'Custom domains are available for hosted projects');
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        customDomain: null,
        customDomainVerifiedAt: null,
        domainVerificationToken: null,
      },
    });
    return res.json(customDomainPayload(updated));
  } catch (err) {
    return next(err);
  }
});

/**
 * Save env vars for a project.
 * buildEnv  — public keys (must start with VITE_), baked into the JS bundle at build time.
 * runtimeEnv — secret keys, encrypted before storage, injected into process env only at start time.
 *
 * Secret values are NEVER returned in any response — the frontend can only see which keys are configured.
 */
router.put('/:projectId/env', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const { buildEnv, runtimeEnv } = z
      .object({
        buildEnv: z.record(z.string()).optional(),
        runtimeEnv: z.record(z.string()).optional(),
      })
      .parse(req.body);

    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    // Enforce: build-time env keys must be VITE_ prefixed (public values only)
    if (buildEnv) {
      for (const key of Object.keys(buildEnv)) {
        if (!key.startsWith('VITE_')) {
          throw new AppError(
            400,
            `Build env key "${key}" must start with VITE_ — secret keys belong in runtimeEnv`,
          );
        }
      }
    }

    const encryptedRuntime =
      runtimeEnv && Object.keys(runtimeEnv).length > 0
        ? encrypt(JSON.stringify(runtimeEnv))
        : undefined;

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        ...(buildEnv !== undefined ? { buildEnv } : {}),
        ...(encryptedRuntime !== undefined ? { runtimeEnv: encryptedRuntime } : {}),
      },
    });

    // For hosted full-stack apps: restart with new env vars immediately
    if (isHostingActive(updated) && updated.runtimeEnv) {
      const envVars = JSON.parse(decrypt(updated.runtimeEnv)) as Record<string, string>;
      startPersistentHosting(projectId, envVars)
        .then(async (result) => {
          if (result.success && result.port) {
            await prisma.project.update({
              where: { id: project.id },
              data: { runPort: result.port },
            });
          }
        })
        .catch((err) => console.error('[env update] persistent restart failed', err));
    }

    return res.json({
      buildEnvKeys: Object.keys((updated.buildEnv as Record<string, string>) ?? {}),
      runtimeEnvConfigured: Boolean(updated.runtimeEnv),
    });
  } catch (err) {
    return next(err);
  }
});

// Get project status + port for preview
router.get('/:projectId', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    const iterationsTotal = await prisma.iterationLog.count({
      where: { projectId: project.id },
    });

    const unpaidDownloadOk = allowUnpaidProjectDownload();

    // Ensure the vite preview process is alive (it dies when app-runner restarts).
    // Update runPort in DB if app-runner assigned a new port.
    let runPort = project.runPort;
    if (project.status === 'running' && runPort) {
      try {
        const runner = await ensureRunning(project.id);
        if (runner.success && runner.port && runner.port !== runPort) {
          runPort = runner.port;
          await prisma.project.update({ where: { id: project.id }, data: { runPort } });
        }
      } catch {
        // non-fatal — frontend will show a retry option
      }
    }

    // Check if the plan requires payments (so frontend can show a "connect Stripe" notice)
    const session = await prisma.session.findUnique({
      where: { id: project.sessionId },
      include: { plan: { select: { data: true } } },
    });
    const planData = (session?.plan?.data as Record<string, unknown> | null) ?? null;
    const planNeedsPayments = planData?.paymentsEnabled === true;
    const planAppType = planData && typeof planData.appType === 'string' ? planData.appType : null;

    return res.json({
      id: project.id,
      sessionId: project.sessionId,
      status: project.status,
      runPort,
      fixAttempts: project.fixAttempts,
      paid: project.paid,
      hosted: isHostingActive(project),
      customDomain: project.customDomain,
      customDomainVerifiedAt: project.customDomainVerifiedAt?.toISOString() ?? null,
      /** Server allows ZIP download without payment (ALLOW_UNPAID_PROJECT_DOWNLOAD=true). */
      allowUnpaidDownload: unpaidDownloadOk,
      iterationsTotal,
      paidIterationCredits: project.paidIterationCredits,
      freeIterationLimit: FREE_ITERATION_LIMIT,
      paymentsEnabled: project.paymentsEnabled ?? false,
      planNeedsPayments,
      planAppType,
    });
  } catch (err) {
    return next(err);
  }
});

// Upload an image for a project. Accepts base64-encoded data URL in JSON body.
// Saves to projects/:id/uploads/ and returns a URL served by app-runner.
router.post('/:projectId/upload-image', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    const { data, filename: originalName } = z.object({
      data: z.string().max(10_000_000), // ~7.5 MB max base64
      filename: z.string().max(255),
    }).parse(req.body);

    const match = data.match(/^data:(image\/[a-z+]+);base64,/);
    if (!match) throw new AppError(400, 'Invalid image data URL');

    const mimeType = match[1];
    const base64 = data.slice(match[0].length);
    const extFromMime: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
      'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
    };
    const ext = extFromMime[mimeType] ??
      (originalName.includes('.') ? originalName.split('.').pop()!.toLowerCase() : 'jpg');

    const safeExt = ext.replace(/[^a-z0-9]/g, '');
    const filename = `${randomUUID()}.${safeExt}`;
    const uploadsDir = path.join(projectPath(projectId), 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(base64, 'base64'));

    return res.json({ url: `/preview-app/${projectId}/uploads/${filename}` });
  } catch (err) {
    return next(err);
  }
});

// Return admin config: appType + typed model fields (from __admin_config.json or regex fallback)
router.get('/:projectId/catalog-models', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    const config = getAdminConfig(projectId);
    return res.json(config);
  } catch (err) {
    return next(err);
  }
});

// Iteration history for the improvements panel
router.get('/:projectId/iteration-history', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    const logs = await prisma.iterationLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, title: true, description: true, createdAt: true },
    });
    return res.json(logs);
  } catch (err) {
    return next(err);
  }
});

// Generate a short-lived HMAC edit token for the preview iframe
router.get('/:projectId/edit-token', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    return res.json({ token: signEditToken(projectId) });
  } catch (err) {
    return next(err);
  }
});

// Stable admin token for X-Admin-Token on catalog / generated-app API writes (app-runner enforces PUT/DELETE)
router.get('/:projectId/admin-token', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });
    return res.json({ token: deriveAdminToken(projectId) });
  } catch (err) {
    return next(err);
  }
});

// Apply an inline content edit (text/image replacement) and trigger a rebuild
router.patch('/:projectId/content', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const { token, original, replacement } = z.object({
      token: z.string(),
      original: z.string().min(1),
      replacement: z.string(),
    }).parse(req.body);

    verifyEditToken(token, projectId);

    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    applyContentPatch(projectId, original, replacement);

    // Mark as building so the frontend knows to poll
    await prisma.project.update({
      where: { id: project.id },
      data: { status: 'building' },
    });

    // Rebuild in background; frontend polls GET /api/preview/:id until status === 'running'
    (async () => {
      try {
        await stopProject(projectId);
        const buildResult = await buildProject(projectId);
        if (!buildResult.success) {
          await prisma.project.update({
            where: { id: projectId },
            data: { status: 'error', errorLog: buildResult.log?.slice(0, 50_000) ?? 'Build failed' },
          });
          return;
        }

        const runResult = await runProject(projectId);
        if (!runResult.success) {
          await prisma.project.update({
            where: { id: projectId },
            data: { status: 'error', errorLog: runResult.log?.slice(0, 50_000) ?? 'Run failed' },
          });
          return;
        }

        await prisma.project.update({
          where: { id: projectId },
          data: { status: 'running', runPort: runResult.port },
        });
      } catch (e) {
        console.error('[content-patch] rebuild failed for', projectId, e);
        const msg = e instanceof Error ? e.message : String(e);
        try {
          await prisma.project.update({
            where: { id: projectId },
            data: { status: 'error', errorLog: msg.slice(0, 50_000) },
          });
        } catch {
          /* ignore */
        }
      }
    })();

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// Download as ZIP (requires paid project)
router.get('/:projectId/download', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findFirstOrThrow({
      where: { id: projectId, session: { userId: req.user.userId } },
    });

    if (!project.paid && !allowUnpaidProjectDownload()) {
      throw new AppError(402, 'Purchase this project to download it', 'payment_required');
    }

    return streamProjectZip(project.id, res);
  } catch (err) {
    return next(err);
  }
});

export default router;
