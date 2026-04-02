import Stripe from 'stripe';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { startPersistentHosting } from './appRunner';
import { decrypt } from '../lib/encryption';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

/** Price in euro cents, read from env with a fallback default. */
function priceInCents(envVar: string, defaultCents: number): number {
  const raw = process.env[envVar];
  if (raw) {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return defaultCents;
}

async function getOrCreateCustomer(userId: string, email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await stripe.customers.create({ email, metadata: { userId } });
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

// Pre-pay to generate a project (charged before generation starts)
export async function createGenerationCheckout(userId: string, email: string, sessionId: string) {
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  if (session.userId !== userId) throw new AppError(403, 'Forbidden');
  if (session.generationPurchased) throw new AppError(400, 'Generation already purchased');

  const customerId = await getOrCreateCustomer(userId, email);
  const baseUrl = process.env.STRIPE_SUCCESS_URL ?? 'http://localhost';

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: { name: 'App Generation', description: 'AI-generated web application' },
        unit_amount: priceInCents('PRICE_PROJECT_CENTS', 15000),
      },
      quantity: 1,
    }],
    success_url: `${baseUrl}/chat/${sessionId}?generate=true`,
    cancel_url: `${baseUrl}/chat/${sessionId}`,
    metadata: { userId, sessionId, type: 'generation' },
  });

  return { url: checkoutSession.url };
}

// One-time charge when a project successfully completes
export async function createProjectCheckout(userId: string, email: string, projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { session: true },
  });

  if (project.session.userId !== userId) throw new AppError(403, 'Forbidden');
  if (project.paid) throw new AppError(400, 'Project already paid');

  const customerId = await getOrCreateCustomer(userId, email);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: { name: 'App Unlock', description: 'Download and full access to your generated app' },
        unit_amount: priceInCents('PRICE_PROJECT_CENTS', 15000),
      },
      quantity: 1,
    }],
    success_url: `${process.env.STRIPE_SUCCESS_URL ?? 'http://localhost'}/preview/${projectId}?paid=true`,
    cancel_url: `${process.env.STRIPE_CANCEL_URL ?? 'http://localhost'}/preview/${projectId}`,
    metadata: { userId, projectId, type: 'project' },
  });

  return { url: session.url };
}

// Monthly hosting subscription per project
export async function createHostingCheckout(userId: string, email: string, projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { session: true },
  });

  if (project.session.userId !== userId) throw new AppError(403, 'Forbidden');
  if (project.hosted) throw new AppError(400, 'Project already hosted');

  const customerId = await getOrCreateCustomer(userId, email);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: { name: 'App Hosting', description: 'Monthly hosting for your generated app' },
        unit_amount: priceInCents('PRICE_HOSTING_CENTS', 999),
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    success_url: `${process.env.STRIPE_SUCCESS_URL ?? 'http://localhost'}/preview/${projectId}?hosted=true`,
    cancel_url: `${process.env.STRIPE_CANCEL_URL ?? 'http://localhost'}/preview/${projectId}`,
    metadata: { userId, projectId, type: 'hosting' },
  });

  return { url: session.url };
}

// €1 one-time charge for a single iteration credit
export async function createIterationSingleCheckout(userId: string, email: string, projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { session: true },
  });

  if (project.session.userId !== userId) throw new AppError(403, 'Forbidden');

  const customerId = await getOrCreateCustomer(userId, email);
  const baseUrl = process.env.STRIPE_SUCCESS_URL?.replace(/\/billing.*$/, '') ?? 'http://localhost';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: { name: 'Едно подобрение', description: 'One AI-powered improvement to your app' },
        unit_amount: priceInCents('PRICE_ITERATION_SINGLE_CENTS', 100),
      },
      quantity: 1,
    }],
    success_url: `${baseUrl}/preview/${projectId}?iteration_paid=true`,
    cancel_url: `${baseUrl}/preview/${projectId}`,
    metadata: { userId, projectId, type: 'iteration_single' },
  });

  return { url: session.url };
}

// €100 one-time charge for 100 iteration credits
export async function createIterationPackCheckout(userId: string, email: string, projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { session: true },
  });

  if (project.session.userId !== userId) throw new AppError(403, 'Forbidden');

  const customerId = await getOrCreateCustomer(userId, email);
  const baseUrl = process.env.STRIPE_SUCCESS_URL?.replace(/\/billing.*$/, '') ?? 'http://localhost';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: { name: '100 подобрения', description: '100 AI-powered improvements to your app' },
        unit_amount: priceInCents('PRICE_ITERATION_PACK_CENTS', 10000),
      },
      quantity: 1,
    }],
    success_url: `${baseUrl}/preview/${projectId}?iteration_paid=true`,
    cancel_url: `${baseUrl}/preview/${projectId}`,
    metadata: { userId, projectId, type: 'iteration_pack' },
  });

  return { url: session.url };
}

export async function createPortalSession(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.stripeCustomerId) throw new AppError(400, 'No billing account found');

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: process.env.STRIPE_SUCCESS_URL ?? 'http://localhost',
  });

  return { url: session.url };
}

export async function handleWebhook(rawBody: Buffer, signature: string) {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    throw new AppError(400, 'Webhook signature verification failed');
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const { type, projectId } = session.metadata ?? {};

      if (type === 'generation' && session.metadata?.sessionId) {
        await prisma.session.update({
          where: { id: session.metadata.sessionId },
          data: { generationPurchased: true },
        });
      }

      if (type === 'project' && projectId) {
        await prisma.project.update({
          where: { id: projectId },
          data: { paid: true },
        });
      }

      if (type === 'iteration_single' && projectId) {
        await prisma.project.update({
          where: { id: projectId },
          data: { paidIterationCredits: { increment: 1 } },
        });
      }

      if (type === 'iteration_pack' && projectId) {
        await prisma.project.update({
          where: { id: projectId },
          data: { paidIterationCredits: { increment: 100 } },
        });
      }

      if (type === 'hosting' && projectId && session.subscription) {
        const updated = await prisma.project.update({
          where: { id: projectId },
          data: { hosted: true, hostingSubscriptionId: session.subscription as string },
        });
        // If the project already has runtime env vars (e.g. Stripe secret key), start it under PM2 now
        if (updated.runtimeEnv) {
          const envVars = JSON.parse(decrypt(updated.runtimeEnv)) as Record<string, string>;
          startPersistentHosting(projectId, envVars)
            .then(async (result) => {
              if (result.success && result.port) {
                await prisma.project.update({ where: { id: projectId }, data: { runPort: result.port } });
              }
            })
            .catch((err) => console.error('[billing] persistent start failed', err));
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.project.updateMany({
        where: { hostingSubscriptionId: sub.id },
        data: { hosted: false, hostingSubscriptionId: null },
      });
      break;
    }
  }
}
