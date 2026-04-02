import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../index';

const router = Router();

// Single session with full message history + plan
router.get('/:sessionId', requireAuth, async (req, res, next) => {
  try {
    const session = await prisma.session.findFirst({
      where: { id: req.params.sessionId, userId: req.user.userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        plan: true,
        project: { select: { id: true, status: true, runPort: true, paid: true, hosted: true } },
      },
    });

    if (!session) return res.status(404).json({ error: 'Session not found' });

    return res.json({
      id: session.id,
      status: session.status,
      generationPurchased: session.generationPurchased,
      messages: session.messages.map((m) => ({ role: m.role, content: m.content })),
      plan: session.plan
        ? { id: session.plan.id, data: session.plan.data, locked: session.plan.locked }
        : null,
      project: session.project ?? null,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: true,
        project: { select: { id: true, status: true, runPort: true, paid: true, hosted: true } },
        messages: {
          where: { role: 'user' },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    const result = sessions.map((s) => ({
      id: s.id,
      status: s.status,
      createdAt: s.createdAt,
      // Use first user message as the session title
      title: s.messages[0]?.content?.slice(0, 80) ?? 'New conversation',
      plan: s.plan
        ? {
            id: s.plan.id,
            locked: s.plan.locked,
            appType: (s.plan.data as any)?.appType ?? null,
          }
        : null,
      project: s.project
        ? {
            id: s.project.id,
            status: s.project.status,
            runPort: s.project.runPort,
            paid: s.project.paid,
            hosted: s.project.hosted,
          }
        : null,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
