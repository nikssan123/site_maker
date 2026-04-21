import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../index';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { stopProject, installDeps, buildProject, runProject, stopPersistentHosting, type RunnerResult } from '../services/appRunner';
import { AppError } from '../middleware/errorHandler';
import { grantTokens } from '../services/tokenAccountingService';
import { autoFix } from '../services/fixerService';
import { writeProjectFiles } from '../lib/fileWriter';
import { getCodeClient } from '../services/aiClient';
import { extractFilesFromCodegenResponse } from '../lib/extractCodegenJson';
import { FIX_SYSTEM } from '../lib/prompts';
import { streamProjectZip } from '../lib/zipBuilder';
import { projectPath } from '../lib/fileWriter';
import { clearSessionEvents, publishEvent } from '../services/eventBus';
import { createProjectSnapshot, restoreProjectSnapshot } from '../services/projectSnapshotService';

const router = Router();
router.use(requireAuth, requireAdmin);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_REPAIR_MAX_TOKENS = parseInt(process.env.ADMIN_REPAIR_MAX_TOKENS ?? '8192', 10);
const ADMIN_REPAIR_FILE_CONTENT_MAX = 8000;
const ADMIN_REPAIR_LOG_MAX = 12000;
const ADMIN_IMPORT_MAX_FILES = 500;
const ADMIN_IMPORT_MAX_TOTAL_CHARS = 5_000_000;

// ─── Overview stats ─────────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalProjects,
      totalSessions,
      paidProjects,
      hostedProjects,
      projectsByStatus,
      sessionsByStatus,
      totalPlanExecutions,
      paidGenerations,
      retryGenerations,
      usersLast7d,
      usersLast30d,
      projectsLast7d,
      avgGenTime,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.project.count(),
      prisma.session.count(),
      prisma.project.count({ where: { paid: true } }),
      prisma.project.count({ where: { hosted: true } }),
      prisma.project.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.session.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.planExecution.count(),
      prisma.planExecution.count({ where: { projectPaid: true } }),
      prisma.planExecution.count({ where: { isRetry: true } }),
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.project.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      // Only fresh projects that reached "running" quickly on first build — reflects actual generation duration.
      prisma.$queryRaw<[{ avg_seconds: number | null }]>`
        SELECT EXTRACT(EPOCH FROM AVG("updatedAt" - "createdAt"))::float AS avg_seconds
        FROM "Project"
        WHERE status = 'running'
          AND "fixAttempts" = 0
          AND ("updatedAt" - "createdAt") < INTERVAL '30 minutes'
      `,
    ]);

    const errorProjects = projectsByStatus.find((s) => s.status === 'error')?._count._all ?? 0;

    res.json({
      totalUsers,
      totalProjects,
      totalSessions,
      paidProjects,
      hostedProjects,
      errorProjects,
      projectsByStatus: Object.fromEntries(projectsByStatus.map((s) => [s.status, s._count._all])),
      sessionsByStatus: Object.fromEntries(sessionsByStatus.map((s) => [s.status, s._count._all])),
      totalPlanExecutions,
      paidGenerations,
      retryGenerations,
      usersLast7d,
      usersLast30d,
      projectsLast7d,
      avgGenerationSeconds: avgGenTime[0]?.avg_seconds ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Daily time-series ──────────────────────────────────────────────────────

router.get('/stats/daily', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(Number(req.query.days) || 30, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [dailyUsers, dailyProjects] = await Promise.all([
      prisma.$queryRaw<Array<{ date: string; count: number }>>`
        SELECT DATE_TRUNC('day', "createdAt")::date::text AS date, COUNT(*)::int AS count
        FROM "User"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1
      `,
      prisma.$queryRaw<Array<{ date: string; count: number }>>`
        SELECT DATE_TRUNC('day', "createdAt")::date::text AS date, COUNT(*)::int AS count
        FROM "Project"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1
      `,
    ]);

    res.json({ dailyUsers, dailyProjects });
  } catch (err) {
    next(err);
  }
});

// ─── Users ──────────────────────────────────────────────────────────────────

router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const search = (req.query.search as string) || '';
    const where = search ? { email: { contains: search, mode: 'insensitive' as const } } : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          isAdmin: true,
          freeProjectUsed: true,
          createdAt: true,
          iterationSubStatus: true,
          iterationSubCurrentPeriodStart: true,
          iterationSubCurrentPeriodEnd: true,
          _count: { select: { sessions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    // Raw token counts are admin-only context — on the user-facing UI we always show percentages.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const usage = users.length
      ? await prisma.tokenUsageLog.groupBy({
          by: ['userId'],
          where: {
            userId: { in: users.map((u) => u.id) },
            endpoint: { startsWith: 'iterate.' },
            createdAt: { gte: thirtyDaysAgo },
          },
          _sum: { inputTokens: true, outputTokens: true, costMicros: true },
        })
      : [];
    const usageByUser = new Map(
      usage.map((u) => [
        u.userId,
        {
          tokens: (u._sum.inputTokens ?? 0) + (u._sum.outputTokens ?? 0),
          costCents: Math.round((u._sum.costMicros ?? 0) / 100),
        },
      ]),
    );

    const usersWithUsage = users.map((u) => ({
      ...u,
      tokensLast30d: usageByUser.get(u.id)?.tokens ?? 0,
      costCentsLast30d: usageByUser.get(u.id)?.costCents ?? 0,
    }));

    res.json({ users: usersWithUsage, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// ─── Token grants & usage (admin) ───────────────────────────────────────────

router.post('/users/:id/token-grants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.params.id);
    if (!UUID_RE.test(userId)) throw new AppError(400, 'Invalid user id');

    const tokens = Number(req.body?.tokens);
    const reasonInput = String(req.body?.reason ?? 'admin_grant').trim();
    const reason: 'admin_grant' | 'topup_purchase' | 'migration' =
      reasonInput === 'topup_purchase' || reasonInput === 'migration' ? reasonInput : 'admin_grant';
    const note = typeof req.body?.note === 'string' ? String(req.body.note).slice(0, 500) : undefined;
    const expiresAtRaw = req.body?.expiresAt;
    const expiresAt =
      expiresAtRaw && !isNaN(Date.parse(String(expiresAtRaw))) ? new Date(String(expiresAtRaw)) : null;

    if (!Number.isFinite(tokens) || tokens <= 0) {
      throw new AppError(400, 'tokens must be a positive integer');
    }

    await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true } });
    const grant = await grantTokens({
      userId,
      tokens: Math.floor(tokens),
      reason,
      grantedBy: req.user.userId,
      note,
      expiresAt,
    });
    res.json({ ok: true, grantId: grant.id });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id/token-usage', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.params.id);
    if (!UUID_RE.test(userId)) throw new AppError(400, 'Invalid user id');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [user, byEndpoint, grants, recentLogs] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          iterationSubStatus: true,
          iterationSubCurrentPeriodStart: true,
          iterationSubCurrentPeriodEnd: true,
        },
      }),
      prisma.tokenUsageLog.groupBy({
        by: ['endpoint'],
        where: { userId, createdAt: { gte: thirtyDaysAgo } },
        _sum: { inputTokens: true, outputTokens: true, costMicros: true },
      }),
      prisma.tokenGrant.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.tokenUsageLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    res.json({
      user,
      byEndpoint: byEndpoint.map((b) => ({
        endpoint: b.endpoint,
        inputTokens: b._sum.inputTokens ?? 0,
        outputTokens: b._sum.outputTokens ?? 0,
        costCents: Math.round((b._sum.costMicros ?? 0) / 100),
      })),
      grants,
      recentLogs,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Projects ───────────────────────────────────────────────────────────────

router.get('/projects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const status = req.query.status as string | undefined;
    const where = status ? { status } : {};

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        select: {
          id: true,
          status: true,
          paid: true,
          hosted: true,
          customDomain: true,
          fixAttempts: true,
          errorLog: true,
          buildLog: true,
          paidIterationCredits: true,
          runPort: true,
          createdAt: true,
          updatedAt: true,
          session: {
            select: {
              id: true,
              user: { select: { email: true } },
            },
          },
          _count: { select: { iterationLogs: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.count({ where }),
    ]);

    res.json({ projects, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// ─── Project control actions ────────────────────────────────────────────────

async function loadAdminProject(projectId: string) {
  if (!UUID_RE.test(projectId)) throw new AppError(400, 'Invalid project id');
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true, hosted: true, sessionId: true, files: true, buildEnv: true },
  });
  if (!project) throw new AppError(404, 'Project not found');
  return project;
}

function normalizeProjectFiles(files: unknown): Record<string, string> {
  if (!files || typeof files !== 'object' || Array.isArray(files)) return {};
  return Object.fromEntries(
    Object.entries(files as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function normalizeImportPath(input: string): string | null {
  const rel = input.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.includes('\0')) return null;
  const parts = rel.split('/').filter(Boolean);
  if (parts.some((p) => p === '..')) return null;
  const first = parts[0]?.toLowerCase();
  if (!first || first === 'node_modules' || first === 'dist' || first === 'dist-hosted' || first === '.git') {
    return null;
  }
  return parts.join('/');
}

async function cleanProjectForSourceImport(projectId: string): Promise<void> {
  const dir = projectPath(projectId);
  await fs.mkdir(dir, { recursive: true });
  const keep = new Set(['node_modules', 'uploads']);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.map(async (entry) => {
    if (keep.has(entry.name)) return;
    await fs.rm(path.join(dir, entry.name), { recursive: true, force: true });
  }));
}

function parseAdminImportFiles(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(400, 'files must be an object of path to text content');
  }
  const out: Record<string, string> = {};
  let totalChars = 0;
  for (const [rawPath, rawContent] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof rawContent !== 'string') continue;
    const rel = normalizeImportPath(rawPath);
    if (!rel) continue;
    totalChars += rawContent.length;
    if (totalChars > ADMIN_IMPORT_MAX_TOTAL_CHARS) {
      throw new AppError(413, 'Uploaded source files are too large');
    }
    out[rel] = rawContent;
  }
  if (Object.keys(out).length === 0) throw new AppError(400, 'No valid source files were uploaded');
  if (Object.keys(out).length > ADMIN_IMPORT_MAX_FILES) throw new AppError(413, 'Too many files uploaded');
  return out;
}

async function writeBuildEnvFile(projectId: string, buildEnv: unknown): Promise<void> {
  if (!buildEnv || typeof buildEnv !== 'object' || Array.isArray(buildEnv)) return;
  const envLines = Object.entries(buildEnv as Record<string, unknown>)
    .filter(([k, v]) => k.startsWith('VITE_') && typeof v === 'string')
    .map(([k, v]) => `${k}=${v}`);
  if (envLines.length > 0) {
    await writeProjectFiles(projectId, { '.env.production': envLines.join('\n') });
  }
}

async function persistResolveFailure(projectId: string, result: RunnerResult, buildLog?: string | null): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'error',
      runPort: null,
      ...(buildLog !== undefined ? { buildLog: buildLog?.slice(-50_000) ?? null } : {}),
      errorLog: result.log?.slice(-50_000) ?? null,
    },
  });
}

function truncateForRepair(value: string | null | undefined, max: number): string {
  if (!value) return '';
  return value.length > max ? `${value.slice(-max)}\n... truncated to latest ${max} chars` : value;
}

function buildAdminRepairPrompt(params: {
  operatorPrompt: string;
  errorLog: string | null;
  buildLog: string | null;
  files: Record<string, string>;
}): string {
  const fileList = Object.entries(params.files)
    .map(([p, content]) => {
      const body = content.length > ADMIN_REPAIR_FILE_CONTENT_MAX
        ? `${content.slice(0, ADMIN_REPAIR_FILE_CONTENT_MAX)}\n// ... truncated`
        : content;
      return `// ${p}\n${body}`;
    })
    .join('\n\n---\n\n');

  return `Admin repair request:
${params.operatorPrompt}

Latest stored error log:
\`\`\`
${truncateForRepair(params.errorLog, ADMIN_REPAIR_LOG_MAX)}
\`\`\`

Latest stored build log:
\`\`\`
${truncateForRepair(params.buildLog, ADMIN_REPAIR_LOG_MAX)}
\`\`\`

Current source files:

${fileList}

Return ONLY a single JSON object shaped like {"files":{"path":"complete file contents"}}.
Return complete replacement files, not diffs.
Fix only what is needed for the admin repair request and logs.
For local relative import errors, either create the exact missing file with Linux-case-correct path or update the importing file to remove/fix the import.
Preserve any APPMAKER_LOGO_SLOT_START/END and APPMAKER_HERO_BG_START/END markers that already exist; do not remove or rename them.`;
}

async function applyAdminPromptRepair(projectId: string, files: Record<string, string>, operatorPrompt: string): Promise<Record<string, string>> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { errorLog: true, buildLog: true },
  });
  const ai = getCodeClient();
  const raw = await ai.complete(
    [{
      role: 'user',
      content: buildAdminRepairPrompt({
        operatorPrompt,
        errorLog: project?.errorLog ?? null,
        buildLog: project?.buildLog ?? null,
        files,
      }),
    }],
    FIX_SYSTEM,
    { maxTokens: ADMIN_REPAIR_MAX_TOKENS },
  );

  const fixedFiles = extractFilesFromCodegenResponse(raw);
  if (!fixedFiles || Object.keys(fixedFiles).length === 0) {
    throw new AppError(500, 'AI repair did not return any valid files');
  }

  const merged = { ...files, ...fixedFiles };
  await writeProjectFiles(projectId, fixedFiles);
  await prisma.project.update({
    where: { id: projectId },
    data: { files: merged },
  });
  return merged;
}

async function markSessionRunningFromAdmin(sessionId: string, projectId: string, port: number | null | undefined): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { status: 'running' } }).catch(() => {});
  await clearSessionEvents(sessionId).catch(() => {});
  await publishEvent(sessionId, {
    type: 'done',
    projectId,
    port: typeof port === 'number' ? port : null,
    source: 'admin_manual_repair',
  }).catch(() => {});
}

router.post('/projects/:id/stop', async (req, res, next) => {
  try {
    const project = await loadAdminProject(String(req.params.id));
    await stopProject(project.id);
    if (project.hosted) await stopPersistentHosting(project.id);
    await prisma.project.update({
      where: { id: project.id },
      data: { runPort: null, status: project.status === 'error' ? 'error' : 'stopped' },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/projects/:id/restart', async (req, res, next) => {
  try {
    const project = await loadAdminProject(String(req.params.id));
    await stopProject(project.id);
    const build = await buildProject(project.id);
    if (!build.success) {
      await prisma.project.update({
        where: { id: project.id },
        data: { status: 'error', errorLog: build.log?.slice(-10_000) ?? null },
      });
      throw new AppError(500, 'Build failed during restart');
    }
    const run = await runProject(project.id);
    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: run.success ? 'running' : 'error',
        runPort: run.port ?? null,
        errorLog: run.success ? null : run.log?.slice(-10_000) ?? null,
      },
    });
    res.json({ ok: run.success, port: run.port ?? null });
  } catch (err) {
    next(err);
  }
});

router.post('/projects/:id/resolve', async (req, res, next) => {
  try {
    const project = await loadAdminProject(String(req.params.id));
    const operatorPrompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
    let files = normalizeProjectFiles(project.files);
    if (Object.keys(files).length === 0) {
      throw new AppError(400, 'Project has no saved source files to repair');
    }
    if (operatorPrompt.length > 20_000) {
      throw new AppError(400, 'Repair prompt is too long');
    }

    await stopProject(project.id);
    await prisma.project.update({
      where: { id: project.id },
      data: { status: 'building', runPort: null },
    });

    await writeProjectFiles(project.id, files);
    await writeBuildEnvFile(project.id, project.buildEnv);
    if (operatorPrompt) {
      files = await applyAdminPromptRepair(project.id, files, operatorPrompt);
    }

    const install = await installDeps(project.id);
    if (!install.success) {
      await persistResolveFailure(project.id, install);
      throw new AppError(500, 'Dependency install failed during repair');
    }

    let build = await buildProject(project.id);
    if (!build.success && !operatorPrompt) {
      build = await autoFix({
        projectId: project.id,
        files,
        failedStep: 'build',
        errorLog: build.log,
        onAttempt: (attempt, error) => {
          console.log(`[admin-resolve] project=${project.id} build autofix attempt=${attempt}: ${error.slice(0, 300)}`);
        },
      });
      if (!build.success) {
        await persistResolveFailure(project.id, build);
        throw new AppError(500, 'Autofix could not resolve the build error');
      }
      const repaired = await prisma.project.findUnique({
        where: { id: project.id },
        select: { files: true },
      });
      files = normalizeProjectFiles(repaired?.files);
    }
    if (!build.success) {
      await persistResolveFailure(project.id, build);
      throw new AppError(500, operatorPrompt ? 'Build failed after admin AI repair' : 'Autofix could not resolve the build error');
    }

    let run = await runProject(project.id);
    if (!run.success && !operatorPrompt) {
      run = await autoFix({
        projectId: project.id,
        files,
        failedStep: 'run',
        errorLog: run.log,
        onAttempt: (attempt, error) => {
          console.log(`[admin-resolve] project=${project.id} run autofix attempt=${attempt}: ${error.slice(0, 300)}`);
        },
      });
      if (!run.success) {
        await persistResolveFailure(project.id, run, build.log);
        throw new AppError(500, 'Autofix could not resolve the runtime error');
      }
    }
    if (!run.success) {
      await persistResolveFailure(project.id, run, build.log);
      throw new AppError(500, operatorPrompt ? 'Runtime failed after admin AI repair' : 'Autofix could not resolve the runtime error');
    }

    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: 'running',
        runPort: run.port ?? null,
        buildLog: build.log?.slice(-50_000) ?? null,
        errorLog: null,
      },
    });
    await markSessionRunningFromAdmin(project.sessionId, project.id, run.port);

    res.json({ ok: true, port: run.port ?? null });
  } catch (err) {
    next(err);
  }
});

router.get('/projects/:id/download', async (req, res, next) => {
  try {
    const project = await loadAdminProject(String(req.params.id));
    streamProjectZip(project.id, res);
  } catch (err) {
    next(err);
  }
});

router.post('/projects/:id/import-files', async (req, res, next) => {
  let snapshotId: string | null = null;
  try {
    const project = await loadAdminProject(String(req.params.id));
    const files = parseAdminImportFiles(req.body?.files);
    const snapshot = await createProjectSnapshot({
      projectId: project.id,
      source: 'admin_import',
      reason: 'Before admin source upload',
    });
    snapshotId = snapshot.id;

    await stopProject(project.id);
    await prisma.project.update({
      where: { id: project.id },
      data: { status: 'building', runPort: null, errorLog: null },
    });

    await cleanProjectForSourceImport(project.id);
    await writeProjectFiles(project.id, files);
    await writeBuildEnvFile(project.id, project.buildEnv);
    await prisma.project.update({
      where: { id: project.id },
      data: { files, fixAttempts: 0 },
    });

    const install = await installDeps(project.id);
    if (!install.success) {
      await persistResolveFailure(project.id, install);
      throw new AppError(500, 'Dependency install failed after source import');
    }

    const build = await buildProject(project.id);
    if (!build.success) {
      await persistResolveFailure(project.id, build);
      throw new AppError(500, 'Build failed after source import');
    }

    const run = await runProject(project.id);
    if (!run.success) {
      await persistResolveFailure(project.id, run, build.log);
      throw new AppError(500, 'Runtime failed after source import');
    }

    await prisma.project.update({
      where: { id: project.id },
      data: {
        status: 'running',
        runPort: run.port ?? null,
        buildLog: build.log?.slice(-50_000) ?? null,
        errorLog: null,
      },
    });
    await markSessionRunningFromAdmin(project.sessionId, project.id, run.port);

    res.json({ ok: true, port: run.port ?? null, fileCount: Object.keys(files).length });
  } catch (err) {
    if (snapshotId) {
      try {
        const restored = await restoreProjectSnapshot(snapshotId);
        if (restored.status === 'running') {
          const build = await buildProject(restored.projectId);
          if (build.success) {
            const run = await runProject(restored.projectId);
            if (run.success) {
              await prisma.project.update({
                where: { id: restored.projectId },
                data: { status: 'running', runPort: run.port ?? null, errorLog: null },
              });
            }
          }
        }
      } catch (rollbackErr) {
        console.error('[admin import] snapshot rollback failed', rollbackErr);
      }
    }
    next(err);
  }
});

router.post('/projects/:id/clear-error', async (req, res, next) => {
  try {
    const project = await loadAdminProject(String(req.params.id));
    await prisma.project.update({
      where: { id: project.id },
      data: { errorLog: null, buildLog: null, fixAttempts: 0 },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/projects/:id', async (req, res, next) => {
  try {
    const project = await loadAdminProject(String(req.params.id));
    await stopProject(project.id).catch(() => {});
    if (project.hosted) await stopPersistentHosting(project.id).catch(() => {});
    await prisma.project.delete({ where: { id: project.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── Revenue ────────────────────────────────────────────────────────────────

router.get('/revenue', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const planCents = parseInt(process.env.PRICE_ITERATION_PLAN_CENTS ?? '2000', 10);
    const topupCents = parseInt(process.env.TOKEN_TOPUP_PACK_CENTS ?? '500', 10);

    const [
      paidProjectCount,
      hostedProjectCount,
      paidGenerationCount,
      activeImprovementSubs,
      topupGrantsLast30d,
    ] = await Promise.all([
      prisma.project.count({ where: { paid: true } }),
      prisma.project.count({ where: { hosted: true } }),
      prisma.planExecution.count({ where: { projectPaid: true } }),
      prisma.user.count({ where: { iterationSubStatus: 'active' } }),
      prisma.tokenGrant.count({
        where: { reason: 'topup_purchase', createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    res.json({
      paidProjectCount,
      hostedProjectCount,
      paidGenerationCount,
      estimatedGenerationRevenue: paidProjectCount * 150,
      estimatedMonthlyHostingRevenue: hostedProjectCount * 20,
      activeImprovementSubs,
      estimatedMonthlyImprovementRevenue: (activeImprovementSubs * planCents) / 100,
      topupPurchasesLast30d: topupGrantsLast30d,
      estimatedTopupRevenueLast30d: (topupGrantsLast30d * topupCents) / 100,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Email health ───────────────────────────────────────────────────────────

router.get('/email-health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [statusCounts, totalDomains, verifiedDomains] = await Promise.all([
      prisma.emailLog.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.emailDomain.count(),
      prisma.emailDomain.count({ where: { verified: true } }),
    ]);

    const byStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));
    const totalSent = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const delivered = byStatus['delivered'] ?? 0;
    const bounced = byStatus['bounced'] ?? 0;

    res.json({
      byStatus,
      totalSent,
      deliveryRate: totalSent > 0 ? ((delivered / totalSent) * 100).toFixed(1) : '0.0',
      bounceRate: totalSent > 0 ? ((bounced / totalSent) * 100).toFixed(1) : '0.0',
      totalDomains,
      verifiedDomains,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Errors ─────────────────────────────────────────────────────────────────

router.get('/errors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: { status: 'error' },
        select: {
          id: true,
          errorLog: true,
          buildLog: true,
          fixAttempts: true,
          createdAt: true,
          updatedAt: true,
          session: {
            select: {
              id: true,
              user: { select: { email: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.count({ where: { status: 'error' } }),
    ]);

    res.json({ projects, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// ─── Plans ──────────────────────────────────────────────────────────────────

router.get('/plans', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const appType = req.query.appType as string | undefined;

    // Filter by appType inside the JSON data field
    const where = appType
      ? { data: { path: ['appType'], equals: appType } }
      : {};

    const [plans, total] = await Promise.all([
      prisma.plan.findMany({
        where,
        select: {
          id: true,
          data: true,
          locked: true,
          createdAt: true,
          session: {
            select: {
              id: true,
              status: true,
              user: { select: { email: true } },
              project: { select: { id: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.plan.count({ where }),
    ]);

    res.json({ plans, total, page, limit });
  } catch (err) {
    next(err);
  }
});

// ─── System ─────────────────────────────────────────────────────────────────

function humanizeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

async function measureDirUnix(dir: string): Promise<{ size: string; count: number } | null> {
  return new Promise((resolve) => {
    exec(
      `du -sb "${dir}" 2>/dev/null && ls -1 "${dir}" 2>/dev/null | wc -l`,
      { timeout: 8000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const lines = stdout.trim().split('\n');
        const bytesStr = lines[0]?.split(/\s+/)[0] ?? '';
        const bytes = Number(bytesStr);
        const count = parseInt(lines[1] ?? '0', 10) || 0;
        if (!Number.isFinite(bytes)) return resolve(null);
        resolve({ size: humanizeBytes(bytes), count });
      },
    );
  });
}

async function measureDirNative(dir: string): Promise<{ size: string; count: number }> {
  let total = 0;
  let topLevelCount = 0;
  let topLevelEntries: string[] = [];
  try {
    topLevelEntries = await fs.readdir(dir);
    topLevelCount = topLevelEntries.length;
  } catch {
    return { size: 'N/A', count: 0 };
  }

  const walk = async (p: string): Promise<void> => {
    let names: string[];
    try {
      names = await fs.readdir(p);
    } catch {
      return;
    }
    for (const name of names) {
      const full = path.join(p, name);
      try {
        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
          await walk(full);
        } else if (stat.isFile()) {
          total += stat.size;
        }
      } catch {
        // skip unreadable entries
      }
    }
  };

  await walk(dir);
  return { size: humanizeBytes(total), count: topLevelCount };
}

router.get('/system', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const mem = process.memoryUsage();
    const generatedAppsDir = process.env.GENERATED_APPS_DIR || '/generated-apps';

    let disk: { size: string; count: number } = { size: 'N/A', count: 0 };
    if (os.platform() !== 'win32') {
      const unix = await measureDirUnix(generatedAppsDir);
      if (unix) disk = unix;
    }
    if (disk.size === 'N/A') {
      disk = await measureDirNative(generatedAppsDir);
    }

    res.json({
      diskUsage: disk.size,
      projectDirCount: disk.count,
      memoryUsage: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
      uptime: Math.round(process.uptime()),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Support tickets ────────────────────────────────────────────────────────

router.get('/support-tickets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const status = req.query.status as string | undefined;
    const where = status && (status === 'open' || status === 'resolved') ? { status } : {};

    const [tickets, total, openCount] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
      prisma.supportTicket.count({ where: { status: 'open' } }),
    ]);

    res.json({ tickets, total, page, limit, openCount });
  } catch (err) {
    next(err);
  }
});

router.patch('/support-tickets/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) throw new AppError(400, 'Invalid ticket id');

    const nextStatus = String(req.body?.status ?? '').trim();
    if (nextStatus !== 'open' && nextStatus !== 'resolved') {
      throw new AppError(400, 'status must be "open" or "resolved"');
    }

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: { status: nextStatus },
    });
    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

export default router;
