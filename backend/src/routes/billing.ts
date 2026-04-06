import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import {
  createGenerationCheckout,
  createProjectCheckout,
  createHostingCheckout,
  createIterationCheckout,
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

// Iteration credits — quantity 1–20; pricing: €1.50 each, capped at €20 for 20
router.post('/iteration-checkout', requireAuth, async (req, res, next) => {
  try {
    const { projectId, quantity } = z.object({
      projectId: z.string(),
      quantity: z.number().int().min(1).max(20).default(1),
    }).parse(req.body);
    const result = await createIterationCheckout(req.user.userId, req.user.email, projectId, quantity);
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
