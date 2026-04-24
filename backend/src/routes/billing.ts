import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../index';
import {
  createGenerationCheckout,
  createProjectCheckout,
  createHostingCheckout,
  createIterationPlanCheckout,
  cancelIterationPlan,
  createTokenTopupCheckout,
  createPortalSession,
  handleWebhook,
  listInvoicesForUser,
  listSubscriptionsForUser,
} from '../services/billingService';
import { getAllowanceSummary } from '../services/tokenAccountingService';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Pre-pay to generate a project
router.post('/generation-checkout', requireAuth, async (req, res, next) => {
  try {
    const { sessionId } = z.object({ sessionId: z.string() }).parse(req.body);
    const result = await createGenerationCheckout(req.user.userId, req.user.email, sessionId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// One-time charge for a completed project
router.post('/project-checkout', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = z.object({ projectId: z.string() }).parse(req.body);
    const result = await createProjectCheckout(req.user.userId, req.user.email, projectId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Monthly hosting subscription for a project
router.post('/hosting-checkout', requireAuth, async (req, res, next) => {
  try {
    const { projectId } = z.object({ projectId: z.string() }).parse(req.body);
    const result = await createHostingCheckout(req.user.userId, req.user.email, projectId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Retired — replaced by the €20/mo improvement-plan subscription below.
router.post('/iteration-checkout', (_req, res) => {
  res.status(410).json({
    error: {
      code: 'gone',
      message:
        'Iteration credits have been replaced by the monthly improvement plan. Please subscribe instead.',
    },
  });
});

// €20/mo improvement-plan subscription — grants MONTHLY_TOKEN_LIMIT tokens per period.
router.post('/iteration-plan-checkout', requireAuth, async (req, res, next) => {
  try {
    const result = await createIterationPlanCheckout(req.user.userId, req.user.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Cancel the improvement plan at period end.
router.post('/iteration-plan-cancel', requireAuth, async (req, res, next) => {
  try {
    const result = await cancelIterationPlan(req.user.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// One-off €5 top-up to extend the current period's quota.
router.post('/token-topup-checkout', requireAuth, async (req, res, next) => {
  try {
    const result = await createTokenTopupCheckout(req.user.userId, req.user.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Improvement plan status — returns percent-only usage, plus a grants summary for the UI.
router.get('/iteration-plan', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const [user, summary, grants] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          iterationSubStatus: true,
          iterationSubCancelAtPeriodEnd: true,
          iterationSubCurrentPeriodStart: true,
          iterationSubCurrentPeriodEnd: true,
        },
      }),
      getAllowanceSummary(userId),
      prisma.tokenGrant.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          reason: true,
          note: true,
          createdAt: true,
          expiresAt: true,
        },
      }),
    ]);

    res.json({
      status: user.iterationSubStatus ?? 'none',
      cancelAtPeriodEnd: user.iterationSubCancelAtPeriodEnd,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      hasActiveSub: summary.hasActiveSub,
      pct: summary.pct,
      grants,
    });
  } catch (err) {
    next(err);
  }
});

// List user's Stripe invoices (most recent first) — for Settings billing card.
router.get('/invoices', requireAuth, async (req, res, next) => {
  try {
    const invoices = await listInvoicesForUser(req.user.userId, 20);
    res.json({ invoices });
  } catch (err) {
    next(err);
  }
});

// List user's active/recent subscriptions — for Settings billing card.
router.get('/subscriptions', requireAuth, async (req, res, next) => {
  try {
    const subscriptions = await listSubscriptionsForUser(req.user.userId);
    res.json({ subscriptions });
  } catch (err) {
    next(err);
  }
});

// Stripe customer portal (manage hosting subscriptions)
router.post('/portal', requireAuth, async (req, res, next) => {
  try {
    const result = await createPortalSession(req.user.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Stripe webhooks — raw body required (mounted in index.ts before express.json)
router.post('/webhook', async (req, res, next) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    await handleWebhook(req.body as Buffer, sig);
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

export default router;
