import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { runIteration } from '../services/iteratorService';
import { clarifyIteration } from '../services/iterateClarifyService';
import { assertCanIterate } from '../services/tokenAccountingService';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';

export const FREE_ITERATION_LIMIT = 2;

const router = Router();

router.post('/clarify', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, messages } = z.object({
      sessionId: z.string(),
      messages: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).min(1),
    }).parse(req.body);

    const userId = req.user.userId;
    const result = await clarifyIteration(sessionId, userId, messages);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, message, spec, targetFiles, explorerContextNotes } = z
      .object({
        sessionId: z.string(),
        message: z.string().min(1),
        spec: z.string().min(1).optional(),
        targetFiles: z.array(z.string().min(1)).max(12).optional(),
        explorerContextNotes: z.string().max(50_000).optional(),
      })
      .parse(req.body);

    const userId = req.user.userId;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
      include: { project: true },
    });

    if (!session?.project) throw new AppError(400, 'Проектът не е намерен');

    const project = session.project;

    // Free tier: first FREE_ITERATION_LIMIT iterations on a given project are always allowed.
    // Past that, access is gated by the per-user iteration-subscription token quota.
    const freeUsed = await prisma.iterationLog.count({
      where: { projectId: project.id },
    });

    if (freeUsed >= FREE_ITERATION_LIMIT) {
      await assertCanIterate(userId);
    }

    // Title = first line of user-facing message (not the internal English spec)
    const titleLine =
      message
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? message;

    const log = await prisma.iterationLog.create({
      data: { projectId: project.id, userId, title: titleLine.slice(0, 120) },
    });

    // Fire and forget — pipeline runs to completion regardless of client connection
    runIteration(sessionId, userId, message, { spec, targetFiles, explorerContextNotes, logId: log.id }).catch((err) => {
      console.error('[iterate] unhandled pipeline error', err);
    });

    res.json({ sessionId });
  } catch (err) {
    next(err);
  }
});

export default router;
