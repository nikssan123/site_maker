import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { runIteration } from '../services/iteratorService';
import { clarifyIteration } from '../services/iterateClarifyService';
import { runIterationAgent, type ExecutionBrief } from '../services/iterateAgent/agentOrchestrator';
import { assertCanIterate } from '../services/tokenAccountingService';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { createProjectSnapshot } from '../services/projectSnapshotService';
import { AttachmentSchema, type Attachment } from '../services/iterateAgent/attachments';

export const FREE_ITERATION_LIMIT = 2;

const router = Router();

router.post('/clarify', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, messages, attachments } = z.object({
      sessionId: z.string(),
      messages: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
      })).min(1),
      attachments: z.array(AttachmentSchema).max(8).optional(),
    }).parse(req.body);

    const userId = req.user.userId;
    const result = await clarifyIteration(sessionId, userId, messages, attachments ?? []);

    if (result.kind === 'ready') {
      const session = await prisma.session.findFirst({
        where: { id: sessionId, userId },
        include: { project: true },
      });
      if (!session?.project) throw new AppError(400, 'Проектът не е намерен');

      const changeRequest = [...messages].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';
      const briefWithAttachments = result.executionBrief
        ? { ...result.executionBrief, attachments: result.attachments ?? [] }
        : undefined;
      const plan = await prisma.iterationPlan.create({
        data: {
          projectId: session.project.id,
          userId,
          changeRequest,
          summary: result.summary,
          planBulletsBg: result.planBulletsBg,
          spec: result.spec,
          targetFiles: result.targetFiles,
          nonGoals: result.nonGoals,
          executionBrief: briefWithAttachments,
          explorerContextNotes: result.explorerContextNotes,
        },
      });

      return res.json({ ...result, planId: plan.id });
    }

    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, message, spec, targetFiles, explorerContextNotes, planId, attachments } = z
      .object({
        sessionId: z.string(),
        message: z.string().min(1),
        planId: z.string().optional(),
        spec: z.string().min(1).optional(),
        targetFiles: z.array(z.string().min(1)).max(12).optional(),
        explorerContextNotes: z.string().max(50_000).optional(),
        attachments: z.array(AttachmentSchema).max(8).optional(),
      })
      .parse(req.body);

    const userId = req.user.userId;

    const session = await prisma.session.findFirst({
      where: { id: sessionId, userId },
      include: { project: true },
    });

    if (!session?.project) throw new AppError(400, 'Проектът не е намерен');

    const project = session.project;

    const freeUsed = await prisma.iterationLog.count({
      where: { projectId: project.id },
    });

    if (freeUsed >= FREE_ITERATION_LIMIT) {
      await assertCanIterate(userId);
    }

    let applyMessage = message;
    let applySpec = spec;
    let applyTargetFiles = targetFiles;
    let applyExplorerContextNotes = explorerContextNotes;
    let approvedPlanId: string | undefined;
    let executionBrief: ExecutionBrief | null = null;
    let applyAttachments: Attachment[] = attachments ?? [];

    if (planId) {
      const plan = await prisma.iterationPlan.findFirst({
        where: { id: planId, userId, projectId: project.id },
      });
      if (!plan) throw new AppError(404, 'Планът за промяна не е намерен');
      if (plan.status !== 'draft') throw new AppError(409, 'Този план вече е използван');

      const bullets = Array.isArray(plan.planBulletsBg) ? (plan.planBulletsBg as string[]) : [];
      applyMessage = [plan.summary, ...bullets].filter(Boolean).join('\n');
      applySpec = plan.spec;
      applyTargetFiles = Array.isArray(plan.targetFiles) ? (plan.targetFiles as string[]) : [];
      applyExplorerContextNotes = plan.explorerContextNotes ?? undefined;
      approvedPlanId = plan.id;
      if (plan.executionBrief && typeof plan.executionBrief === 'object') {
        const briefObj = plan.executionBrief as Record<string, unknown>;
        executionBrief = briefObj as unknown as ExecutionBrief;
        const persisted = Array.isArray(briefObj.attachments) ? briefObj.attachments : [];
        if (persisted.length > 0) {
          const parsed = z.array(AttachmentSchema).safeParse(persisted);
          if (parsed.success) applyAttachments = parsed.data;
        }
      }
    }

    const snapshot = await createProjectSnapshot({
      projectId: project.id,
      userId,
      source: 'iteration',
      reason: applyMessage,
    });

    if (approvedPlanId) {
      await prisma.iterationPlan.update({
        where: { id: approvedPlanId },
        data: { status: 'approved', approvedAt: new Date(), snapshotBeforeId: snapshot.id },
      });
    }

    const titleLine =
      applyMessage
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0) ?? applyMessage;

    const log = await prisma.iterationLog.create({
      data: { projectId: project.id, userId, title: titleLine.slice(0, 120) },
    });

    if (approvedPlanId) {
      await prisma.iterationPlan.update({
        where: { id: approvedPlanId },
        data: { status: 'applying', iterationLogId: log.id },
      });
    }

    if (approvedPlanId && executionBrief) {
      runIterationAgent({
        sessionId,
        userId,
        projectId: project.id,
        planId: approvedPlanId,
        snapshotBeforeId: snapshot.id,
        executionBrief,
        attachments: applyAttachments,
        logId: log.id,
      }).catch((err) => {
        console.error('[iterate-agent] unhandled pipeline error', err);
      });
    } else {
      runIteration(sessionId, userId, applyMessage, {
        spec: applySpec,
        targetFiles: applyTargetFiles,
        explorerContextNotes: applyExplorerContextNotes,
        logId: log.id,
        planId: approvedPlanId,
        snapshotBeforeId: snapshot.id,
      }).catch((err) => {
        console.error('[iterate] unhandled pipeline error', err);
      });
    }

    return res.json({ sessionId });
  } catch (err) {
    return next(err);
  }
});

export default router;
