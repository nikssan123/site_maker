import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
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

function requireInternalSecret(req: { header: (name: string) => string | undefined }) {
  const secret = (process.env.INTERNAL_SECRET ?? '').trim();
  if (!secret) return;
  const got = String(req.header('x-internal-secret') ?? '').trim();
  if (!got || got !== secret) throw new AppError(401, 'Unauthorized');
}

/** Sign state to prevent CSRF on the OAuth callback. Encodes both projectId and userId. */
function signState(projectId: string, userId: string): string {
  const payload = `${projectId}:${userId}`;
  const sig = createHmac('sha256', process.env.JWT_SECRET!)
    .update(payload)
    .digest('hex');
  return `${payload}.${sig}`;
}

function verifyState(state: string): { projectId: string; userId: string } | null {
  const lastDot = state.lastIndexOf('.');
  if (lastDot === -1) return null;
  const payload = state.slice(0, lastDot);
  const sig = state.slice(lastDot + 1);

  const colon = payload.indexOf(':');
  if (colon === -1) return null;
  const projectId = payload.slice(0, colon);
  const userId = payload.slice(colon + 1);
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || !userId) return null;

  const expected = createHmac('sha256', process.env.JWT_SECRET!)
    .update(payload)
    .digest('hex');
  if (sig.length !== expected.length) return null;

  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { projectId, userId };
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

    const verified = verifyState(state ?? '');

    const errorRedirect = (e: string) =>
      res.redirect(`${APP_BASE_URL}/payments/${verified?.projectId ?? ''}?error=${encodeURIComponent(e)}`);

    if (error) return errorRedirect('access_denied');
    if (!verified) return errorRedirect('invalid_state');
    if (!code) return errorRedirect('missing_code');

    const { projectId, userId } = verified;

    // Verify the user actually owns this project
    await verifyOwnership(projectId, userId);

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

    const allowedHosts = new Set<string>();
    const sitesHost = (process.env.HOSTING_SITES_HOST ?? '').trim().toLowerCase();
    if (sitesHost) allowedHosts.add(`${project.id}.${sitesHost}`);
    if (project.customDomain) allowedHosts.add(project.customDomain.toLowerCase());
    allowedHosts.add('localhost');
    allowedHosts.add('127.0.0.1');

    for (const raw of [body.successUrl, body.cancelUrl]) {
      const host = new URL(raw).hostname.toLowerCase();
      if (!allowedHosts.has(host)) {
        throw new AppError(400, 'Redirect URL must match the project domain');
      }
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'eur',
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

// ─── POST /verify-checkout-session/:projectId  (internal — called by generated server.js) ───
router.post('/verify-checkout-session/:projectId', async (req, res, next) => {
  try {
    requireInternalSecret(req);

    const body = z.object({
      sessionId: z.string().min(1),
    }).parse(req.body);

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: req.params.projectId },
    });

    if (!project.paymentsEnabled || !project.stripeAccountId) {
      throw new AppError(400, 'Payments not configured for this project');
    }

    const session = await stripe.checkout.sessions.retrieve(
      body.sessionId,
      {},
      { stripeAccount: project.stripeAccountId },
    );

    if (session.mode !== 'payment') {
      throw new AppError(400, 'Invalid checkout session mode');
    }
    if (session.payment_status !== 'paid') {
      throw new AppError(400, 'Payment not completed');
    }

    return res.json({
      ok: true,
      sessionId: session.id,
      amountTotal: session.amount_total ?? 0,
      currency: String(session.currency ?? '').toLowerCase(),
      customerEmail: session.customer_details?.email ?? session.customer_email ?? null,
      paymentStatus: session.payment_status,
      status: session.status ?? null,
    });
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
