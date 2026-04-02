import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index';
import { autoFix } from '../services/fixerService';
import { runProject } from '../services/appRunner';

const router = Router();

/**
 * Resolve a verified custom domain to its project ID.
 * Used by app-runner to route custom-domain traffic without DB access.
 * Internal-only — only reachable inside the Docker network, never exposed to the internet.
 */
router.get('/resolve-domain', async (req, res) => {
  const host = String(req.query.host ?? '').toLowerCase().trim();
  if (!host) return res.status(400).json({ error: 'host required' });

  const project = await prisma.project.findFirst({
    where: {
      customDomain: host,
      customDomainVerifiedAt: { not: null },
      hosted: true,
    },
    select: { id: true },
  });

  if (!project) return res.status(404).json({ error: 'not found' });
  return res.json({ projectId: project.id });
});

/**
 * Auto-fix a crashing server.js using Claude.
 * Called by app-runner when a full-stack preview fails to start.
 * Internal-only — never exposed to the internet.
 */
router.post('/fix-run', async (req, res) => {
  try {
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

export default router;
