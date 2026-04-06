import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { runIteration } from '../services/iteratorService';
import { clarifyIteration } from '../services/iterateClarifyService';
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
    const { sessionId, message, spec } = z
      .object({ sessionId: z.string(), message: z.string().min(1), spec: z.string().min(1).optional() })
      .parse(req.body);

    const userId = req.user.userId;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
      include: { project: true },
    });

    if (!session?.project) throw new AppError(400, 'Проектът не е намерен');

    const project = session.project;

    // Count all iterations ever run on this project
    const totalUsed = await prisma.iterationLog.count({
      where: { projectId: project.id },
    });

    const allowedTotal = FREE_ITERATION_LIMIT + project.paidIterationCredits;

    if (totalUsed >= allowedTotal) {
      throw new AppError(
        402,
        'Безплатните подобрения са изчерпани — закупете още, за да продължите',
        'iteration_payment_required',
      );
    }

    // Credit deduction happens synchronously before the fire-and-forget launch
    const log = await prisma.iterationLog.create({
      data: { projectId: project.id, userId, title: message.slice(0, 120) },
    });

    // Fire and forget — pipeline runs to completion regardless of client connection
    runIteration(sessionId, userId, message, { spec, logId: log.id }).catch((err) => {
      console.error('[iterate] unhandled pipeline error', err);
    });

    res.json({ sessionId });
  } catch (err) {
    next(err);
  }
});

export default router;
