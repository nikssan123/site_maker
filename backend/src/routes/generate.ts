import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { runGenerationPipeline, runGenerationResume, isGenerationActive } from '../services/generatorService';
import { subscribeToSession } from '../services/eventBus';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const TERMINAL_TYPES = new Set(['done', 'fatal', 'preview_updated']);

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = z.object({ sessionId: z.string() }).parse(req.body);
    const userId = req.user.userId;

    const [user, session] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.session.findUniqueOrThrow({
        where: { id: sessionId },
        include: { project: { select: { status: true, paid: true } } },
      }),
    ]);

    if (session.userId !== userId) throw new AppError(403, 'Forbidden');

    const existingProject = (session as any).project as { status: string; paid: boolean } | null;
    const isRetry = existingProject?.status === 'error';

    let projectPaid = false;

    if (isRetry) {
      projectPaid = existingProject!.paid;
    } else if (!user.freeProjectUsed) {
      await prisma.user.update({ where: { id: userId }, data: { freeProjectUsed: true } });
    } else if (session.generationPurchased) {
      projectPaid = true;
    } else {
      throw new AppError(402, 'Payment required to generate', 'payment_required');
    }

    if (isGenerationActive(sessionId)) {
      res.status(409).json({
        error: 'Generation already in progress',
        code: 'generation_in_progress',
        sessionId,
      });
      return;
    }

    // Fire and forget — pipeline runs to completion regardless of client connection
    runGenerationPipeline(sessionId, userId, projectPaid).catch((err) => {
      console.error('[generate] unhandled pipeline error', err);
    });

    res.json({ sessionId });
  } catch (err) {
    next(err);
  }
});

/** Continue install → build → run from saved project files (no codegen, does not clear SSE history). */
router.post('/resume', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = z.object({ sessionId: z.string() }).parse(req.body);
    const userId = req.user.userId;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new AppError(403, 'Forbidden');

    if (session.status !== 'generating') {
      throw new AppError(400, 'Session is not generating', 'cannot_resume');
    }

    runGenerationResume(sessionId, userId).catch((err) => {
      console.error('[generate/resume] unhandled pipeline error', err);
    });

    res.json({ ok: true, sessionId });
  } catch (err) {
    next(err);
  }
});

/**
 * SSE endpoint — replays all stored events then subscribes live.
 * Clients reconnect here after a dropped connection; full history is replayed from DB.
 */
router.get('/events/:sessionId', requireAuth, async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.userId;

  const session = await prisma.session.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  });
  if (!session) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (payload: object) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
  };

  // 1. Replay stored events in insertion order
  const past = await prisma.generationEvent.findMany({
    where: { sessionId },
    orderBy: { id: 'asc' },
  });
  for (const row of past) {
    send(row.payload as object);
  }

  // If the last replayed event was terminal, close immediately — no live subscription needed
  const last = past.length > 0 ? (past[past.length - 1]!.payload as any) : null;
  if (last && TERMINAL_TYPES.has(last.type)) {
    res.end();
    return;
  }

  // 2. Subscribe to live events
  const unsubscribe = subscribeToSession(sessionId, (payload) => {
    send(payload);
    if (TERMINAL_TYPES.has((payload as any).type)) {
      res.end();
    }
  });

  req.on('close', unsubscribe);
});

export default router;
