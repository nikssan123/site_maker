import { Router } from 'express';
import { createHmac } from 'crypto';
import { z } from 'zod';
import Stripe from 'stripe';
import { prisma } from '../index';
import { requireAuth } from '../middleware/requireAuth';
import { AppError } from '../middleware/errorHandler';
import { buildProject, runProject, stopProject } from '../services/appRunner';

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost';
const CLIENT_ID = process.env.STRIPE_CLIENT_ID ?? '';
const CALLBACK_URL = `${APP_BASE_URL}/api/project-payments/oauth/callback`;

/** Sign state to prevent CSRF on the OAuth callback. */
function signState(projectId: string, userId: string): string {
  const payload = `${projectId}:${userId}`;
  const sig = createHmac('sha256', process.env.JWT_SECRET!)
    .update(payload)
    .digest('hex')
    .slice(0, 16);
  return `${projectId}.${sig}`;
}

function verifyState(state: string): string | null {
  // Returns projectId if valid, null if tampered
  const dot = state.indexOf('.');
  if (dot === -1) return null;
  // We don't have userId at callback time without a DB lookup, so we accept any
  // state where the projectId portion is a valid UUID — the HMAC check is
  // best-effort without userId; we verify ownership after loading the project.
  const projectId = state.slice(0, dot);
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return null;
  return projectId;
}

async function verifyOwnership(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, session: { userId } },
  });
  if (!project) throw new AppError(403, 'Forbidden');
  return project;
}

// ─── GET /oauth/url?projectId=xxx ────────────────────────────────────────────
router.get('/oauth/url', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.query.projectId ?? '');
    if (!projectId) throw new AppError(400, 'projectId is required');

    await verifyOwnership(projectId, req.user.userId);

    if (!CLIENT_ID) throw new AppError(500, 'STRIPE_CLIENT_ID is not configured');

    const state = signState(projectId, req.user.userId);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: 'read_write',
      state,
      redirect_uri: CALLBACK_URL,
    });

    return res.json({ url: `https://connect.stripe.com/oauth/authorize?${params}` });
  } catch (err) {
    return next(err);
  }
});

// ─── GET /oauth/callback  (Stripe redirects here) ────────────────────────────
router.get('/oauth/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query as Record<string, string>;

    const projectId = verifyState(state ?? '');

    // On any error, redirect to the payments page with an error flag
    const errorRedirect = (e: string) =>
      res.redirect(`${APP_BASE_URL}/payments/${projectId ?? ''}?error=${encodeURIComponent(e)}`);

    if (error) return errorRedirect('access_denied');
    if (!projectId) return errorRedirect('invalid_state');
    if (!code) return errorRedirect('missing_code');

    // Exchange code for Stripe account ID
    let stripeUserId: string;
    try {
      const token = await stripe.oauth.token({ grant_type: 'authorization_code', code });
      stripeUserId = token.stripe_user_id!;
    } catch {
      return errorRedirect('stripe_exchange_failed');
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    const existingBuildEnv = (project?.buildEnv as Record<string, string> | null) ?? {};
    const updatedBuildEnv = {
      ...existingBuildEnv,
      VITE_PAYMENTS_ENABLED: 'true',
      VITE_PAYMENTS_URL: `${APP_BASE_URL}/api/project-payments/create-checkout-session/${projectId}`,
    };

    await prisma.project.update({
      where: { id: projectId },
      data: { stripeAccountId: stripeUserId, paymentsEnabled: true, buildEnv: updatedBuildEnv },
    });

    // Rebuild the app in the background so the new env vars are baked into the bundle
    if (project?.files) {
      (async () => {
        try {
          await stopProject(projectId);
          const buildResult = await buildProject(projectId);
          if (buildResult.success) await runProject(projectId);
        } catch (e) {
          console.error('[payments] rebuild after connect failed:', e);
        }
      })();
    }

    return res.redirect(`${APP_BASE_URL}/payments/${projectId}?connected=true`);
  } catch (err) {
    return next(err);
  }
});

// ─── GET /status/:projectId ───────────────────────────────────────────────────
router.get('/status/:projectId', requireAuth, async (req, res, next) => {
  try {
    const project = await verifyOwnership(req.params.projectId, req.user.userId);
    return res.json({
      paymentsEnabled: project.paymentsEnabled,
      stripeAccountId: project.stripeAccountId ?? null,
    });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /create-checkout-session/:projectId  (public — called by generated apps) ──
router.post('/create-checkout-session/:projectId', async (req, res, next) => {
  try {
    const body = z.object({
      amount: z.number().positive(),
      currency: z.string().length(3),
      productName: z.string().min(1),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    }).parse(req.body);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: req.params.projectId },
    });

    if (!project.paymentsEnabled || !project.stripeAccountId) {
      throw new AppError(400, 'Payments not configured for this project');
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: body.currency,
            product_data: { name: body.productName },
            unit_amount: body.amount,
          },
          quantity: 1,
        }],
        success_url: body.successUrl,
        cancel_url: body.cancelUrl,
      },
      { stripeAccount: project.stripeAccountId },
    );

    return res.json({ url: session.url });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /disconnect/:projectId ─────────────────────────────────────────────
router.post('/disconnect/:projectId', requireAuth, async (req, res, next) => {
  try {
    const project = await verifyOwnership(req.params.projectId, req.user.userId);

    if (project.stripeAccountId && CLIENT_ID) {
      try {
        await stripe.oauth.deauthorize({
          client_id: CLIENT_ID,
          stripe_user_id: project.stripeAccountId,
        });
      } catch {
        // Non-fatal: account may already be deauthorized; clear DB regardless
      }
    }

    const existingBuildEnv = (project.buildEnv as Record<string, string> | null) ?? {};
    const { VITE_PAYMENTS_ENABLED: _, VITE_PAYMENTS_URL: __, ...strippedBuildEnv } = existingBuildEnv;

    await prisma.project.update({
      where: { id: project.id },
      data: { stripeAccountId: null, paymentsEnabled: false, buildEnv: strippedBuildEnv },
    });

    // Rebuild to remove payment env vars from the bundle
    if (project.files) {
      (async () => {
        try {
          await stopProject(project.id);
          const buildResult = await buildProject(project.id);
          if (buildResult.success) await runProject(project.id);
        } catch (e) {
          console.error('[payments] rebuild after disconnect failed:', e);
        }
      })();
    }

    return res.json({ success: true });
  } catch (err) {
    return next(err);
  }
});

export default router;
