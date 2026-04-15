import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { lockPlan } from '../services/plannerService';
import { prisma } from '../index';

const router = Router();

function normalizePlanLanguages(languages: unknown): string[] {
  const values = Array.isArray(languages) ? languages : [];
  const normalized = Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  return normalized.includes('bg') ? normalized : ['bg', ...normalized];
}

router.get('/:sessionId', requireAuth, async (req, res, next) => {
  try {
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { sessionId: req.params.sessionId },
    });
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/plan/:planId — merge updates (e.g. colorTheme) into plan data before locking
router.patch('/:planId', requireAuth, async (req, res, next) => {
  try {
    const { planId } = z.object({ planId: z.string() }).parse(req.params);
    const updates = z
      .object({
        colorTheme: z
          .object({
            name: z.string(),
            primary: z.string(),
            secondary: z.string(),
            background: z.string(),
          })
          .optional(),
        languages: z.array(z.string()).optional(),
        socialLinks: z
          .object({
            facebook: z.string().optional(),
            instagram: z.string().optional(),
            tiktok: z.string().optional(),
            linkedin: z.string().optional(),
            youtube: z.string().optional(),
            x: z.string().optional(),
          })
          .partial()
          .optional(),
      })
      .parse(req.body);

    const plan = await prisma.plan.findUniqueOrThrow({
      where: { id: planId },
      include: { session: true },
    });
    if (plan.session.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const normalizedUpdates = {
      ...updates,
      ...(updates.languages ? { languages: normalizePlanLanguages(updates.languages) } : {}),
    };

    const updated = await prisma.plan.update({
      where: { id: planId },
      data: { data: { ...(plan.data as object), ...normalizedUpdates } },
    });
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

router.post('/:planId/lock', requireAuth, async (req, res, next) => {
  try {
    const { planId } = z.object({ planId: z.string() }).parse(req.params);
    const plan = await lockPlan(planId, req.user.userId);
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

export default router;
