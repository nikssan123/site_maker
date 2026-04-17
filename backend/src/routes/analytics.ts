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

const BLOG_RE = /^\/(blog|posts|articles?|news)\/([\w-]+)/i;
const PRODUCT_RE = /^\/(products?|shop|store|catalog)\/([\w-]+)/i;

function slugToTitle(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Called by app-runner (internal) — no auth required
router.post('/track', async (req, res, next) => {
  try {
    const data = TrackSchema.parse(req.body);
    const device = detectDevice(data.userAgent ?? '');

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

    // Daily views + visitors
    const dailyViewsMap = new Map<string, number>();
    const dailyVisitorSets = new Map<string, Set<string>>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setUTCDate(since.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      dailyViewsMap.set(key, 0);
      dailyVisitorSets.set(key, new Set());
    }
    for (const e of events) {
      const key = e.createdAt.toISOString().slice(0, 10);
      dailyViewsMap.set(key, (dailyViewsMap.get(key) ?? 0) + 1);
      if (e.visitorId) {
        const set = dailyVisitorSets.get(key);
        if (set) set.add(e.visitorId);
      }
    }
    const daily = Array.from(dailyViewsMap.entries()).map(([date, views]) => ({
      date,
      views,
      visitors: dailyVisitorSets.get(date)?.size ?? 0,
    }));

    // Truly unique visitors across the whole period
    const allVisitors = new Set<string>();
    for (const e of events) {
      if (e.visitorId) allVisitors.add(e.visitorId);
    }

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

    // Popular blog posts (derived from page-view paths)
    const blogMap = new Map<string, { slug: string; views: number }>();
    const productMap = new Map<string, { slug: string; views: number }>();
    for (const e of events) {
      const blogMatch = BLOG_RE.exec(e.path);
      if (blogMatch) {
        const slug = blogMatch[2];
        const entry = blogMap.get(slug);
        if (entry) entry.views++;
        else blogMap.set(slug, { slug, views: 1 });
      }
      const productMatch = PRODUCT_RE.exec(e.path);
      if (productMatch) {
        const slug = productMatch[2];
        const entry = productMap.get(slug);
        if (entry) entry.views++;
        else productMap.set(slug, { slug, views: 1 });
      }
    }

    const popularBlogPosts = Array.from(blogMap.values())
      .sort((a, b) => b.views - a.views)
      .slice(0, 5)
      .map((p) => ({ title: slugToTitle(p.slug), slug: p.slug, views: p.views }));

    const popularProducts = Array.from(productMap.values())
      .sort((a, b) => b.views - a.views)
      .slice(0, 5)
      .map((p) => ({ title: slugToTitle(p.slug), slug: p.slug, views: p.views }));

    res.json({
      totalViews: events.length,
      uniqueVisitors: allVisitors.size,
      daily,
      devices,
      topReferrers,
      popularBlogPosts,
      popularProducts,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
