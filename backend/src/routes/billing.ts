import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import {
  createGenerationCheckout,
  createProjectCheckout,
  createHostingCheckout,
  createIterationSingleCheckout,
  createIterationPackCheckout,
  createPortalSession,
  handleWebhook,
} from '../services/billingService';

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

// Iteration credits — pack: false → €1 single, pack: true → €100 for 100 credits
router.post('/iteration-checkout', requireAuth, async (req, res, next) => {
  try {
    const { projectId, pack } = z.object({ projectId: z.string(), pack: z.boolean().default(false) }).parse(req.body);
    const result = pack
      ? await createIterationPackCheckout(req.user.userId, req.user.email, projectId)
      : await createIterationSingleCheckout(req.user.userId, req.user.email, projectId);
    res.json(result);
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
