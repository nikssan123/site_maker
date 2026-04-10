import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { prisma } from '../index';
import { exec } from 'child_process';

const router = Router();
router.use(requireAuth, requireAdmin);

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
      prisma.$queryRaw<[{ avg_seconds: number | null }]>`
        SELECT EXTRACT(EPOCH FROM AVG("updatedAt" - "createdAt"))::float AS avg_seconds
        FROM "Project"
        WHERE status = 'running'
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
          _count: { select: { sessions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page, limit });
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

// ─── Revenue ────────────────────────────────────────────────────────────────

router.get('/revenue', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [paidProjectCount, hostedProjectCount, iterationCredits, paidGenerationCount] =
      await Promise.all([
        prisma.project.count({ where: { paid: true } }),
        prisma.project.count({ where: { hosted: true } }),
        prisma.project.aggregate({ _sum: { paidIterationCredits: true } }),
        prisma.planExecution.count({ where: { projectPaid: true } }),
      ]);

    const totalIterationCredits = iterationCredits._sum.paidIterationCredits ?? 0;

    res.json({
      paidProjectCount,
      hostedProjectCount,
      paidGenerationCount,
      totalIterationCredits,
      estimatedGenerationRevenue: paidProjectCount * 150,
      estimatedMonthlyHostingRevenue: hostedProjectCount * 20,
      estimatedIterationRevenue: totalIterationCredits * 1.5,
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

router.get('/system', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const mem = process.memoryUsage();
    const generatedAppsDir = process.env.GENERATED_APPS_DIR || '/generated-apps';

    const diskInfo = await new Promise<{ diskUsage: string; dirCount: number }>((resolve) => {
      exec(
        `du -sh "${generatedAppsDir}" 2>/dev/null && ls -1 "${generatedAppsDir}" 2>/dev/null | wc -l`,
        { timeout: 5000 },
        (err, stdout) => {
          if (err) {
            resolve({ diskUsage: 'N/A', dirCount: 0 });
            return;
          }
          const lines = stdout.trim().split('\n');
          const diskUsage = lines[0]?.split('\t')[0] ?? 'N/A';
          const dirCount = parseInt(lines[1] ?? '0', 10) || 0;
          resolve({ diskUsage, dirCount });
        },
      );
    });

    res.json({
      diskUsage: diskInfo.diskUsage,
      projectDirCount: diskInfo.dirCount,
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

export default router;
