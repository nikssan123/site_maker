import { Router } from 'express';
import { z } from 'zod';
import { createHash } from 'crypto';
import { prisma } from '../index';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

const TrackSchema = z.object({
  projectId: z.string(),
  path: z.string().default('/'),
  referrer: z.string().optional(),
  userAgent: z.string().optional(),
  ip: z.string().optional(),
});

function detectDevice(ua: string): 'mobile' | 'tablet' | 'desktop' {
  const u = ua.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(u)) return 'mobile';
  if (/tablet|ipad/.test(u)) return 'tablet';
  return 'desktop';
}

// Called by app-runner (internal) — no auth required
router.post('/track', async (req, res, next) => {
  try {
    const data = TrackSchema.parse(req.body);
    const device = detectDevice(data.userAgent ?? '');

    // Anonymous daily visitor hash (IP + projectId + UTC date) — no PII stored
    const today = new Date().toISOString().slice(0, 10);
    const visitorId = data.ip
      ? createHash('sha256').update(`${data.ip}:${data.projectId}:${today}`).digest('hex').slice(0, 16)
      : undefined;

    await prisma.analyticsPageView.create({
      data: {
        projectId: data.projectId,
        path: data.path,
        device,
        referrer: data.referrer || null,
        visitorId,
      },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Authenticated — project owner only
router.get('/:projectId', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const days = Math.min(Number(req.query.days ?? 30), 90);

    // Verify ownership via session
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { session: { select: { userId: true } } },
    });
    if (!project || project.session.userId !== req.user.userId) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const events = await prisma.analyticsPageView.findMany({
      where: { projectId, createdAt: { gte: since } },
      select: { path: true, device: true, referrer: true, visitorId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Daily page views (YYYY-MM-DD → count)
    const dailyMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      dailyMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const e of events) {
      const key = e.createdAt.toISOString().slice(0, 10);
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
    }
    const daily = Array.from(dailyMap.entries()).map(([date, views]) => ({ date, views }));

    // Unique visitors (distinct visitorId per day)
    const uvSet = new Set<string>();
    for (const e of events) {
      if (e.visitorId) uvSet.add(`${e.createdAt.toISOString().slice(0, 10)}:${e.visitorId}`);
    }

    // Top pages
    const pageMap = new Map<string, number>();
    for (const e of events) pageMap.set(e.path, (pageMap.get(e.path) ?? 0) + 1);
    const topPages = Array.from(pageMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, views]) => ({ path, views }));

    // Device breakdown
    const deviceMap = new Map<string, number>();
    for (const e of events) deviceMap.set(e.device, (deviceMap.get(e.device) ?? 0) + 1);
    const devices = Array.from(deviceMap.entries()).map(([device, count]) => ({ device, count }));

    // Top referrers
    const refMap = new Map<string, number>();
    for (const e of events) {
      if (e.referrer) refMap.set(e.referrer, (refMap.get(e.referrer) ?? 0) + 1);
    }
    const topReferrers = Array.from(refMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([referrer, count]) => ({ referrer, count }));

    res.json({
      totalViews: events.length,
      uniqueVisitors: uvSet.size,
      daily,
      topPages,
      devices,
      topReferrers,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
