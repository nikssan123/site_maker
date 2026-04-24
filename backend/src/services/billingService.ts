import Stripe from 'stripe';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { startPersistentHosting, stopPersistentHosting } from './appRunner';
import { decrypt } from '../lib/encryption';
import {
  extendHostingFreeUntil,
  isHostingActive,
  SITE_PURCHASE_BONUS_ITERATIONS,
  SITE_PURCHASE_FREE_HOSTING_DAYS,
} from '../lib/hostingActive';
import { reserveRandomSubdomain } from '../lib/randomSubdomain';
import { grantTokens } from './tokenAccountingService';
import { EmailService } from './emailService';
import { buildInvoiceEmail, type InvoiceLineItem } from '../lib/invoiceEmail';

/** Lazily-instantiated; never throws at import time so missing email config doesn't break checkout. */
let invoiceMailer: EmailService | null = null;
function getInvoiceMailer(): EmailService | null {
  try {
    if (!invoiceMailer) invoiceMailer = new EmailService();
    return invoiceMailer;
  } catch (e) {
    console.warn('[billing] invoice mailer disabled:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function sendInvoiceEmailFromStripeInvoice(invoice: Stripe.Invoice): Promise<void> {
  const customerEmail =
    invoice.customer_email ?? (typeof invoice.customer === 'string' ? null : (invoice.customer as Stripe.Customer | null)?.email ?? null);
  if (!customerEmail) {
    // Fall back to the user record by stripeCustomerId.
    const cid = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as Stripe.Customer | null)?.id ?? null;
    if (!cid) return;
    const user = await prisma.user.findFirst({ where: { stripeCustomerId: cid }, select: { email: true } });
    if (!user?.email) return;
    await sendInvoiceEmailRaw(user.email, invoice);
    return;
  }
  await sendInvoiceEmailRaw(customerEmail, invoice);
}

async function sendInvoiceEmailRaw(to: string, invoice: Stripe.Invoice): Promise<void> {
  const mailer = getInvoiceMailer();
  if (!mailer) return;
  const lineItems: InvoiceLineItem[] = (invoice.lines?.data ?? []).map((line) => ({
    description: line.description ?? line.price?.product
      ? (typeof line.price?.product === 'string' ? null : (line.price?.product as { name?: string } | null)?.name ?? null) ?? 'Покупка'
      : 'Покупка',
    amountCents: line.amount,
    currency: (line.currency ?? invoice.currency ?? 'eur').toLowerCase(),
  }));
  const { subject, html } = buildInvoiceEmail({
    invoiceNumber: invoice.number ?? null,
    paidAt: new Date(((invoice.status_transitions?.paid_at ?? invoice.created) ?? Math.floor(Date.now() / 1000)) * 1000),
    totalCents: invoice.amount_paid > 0 ? invoice.amount_paid : invoice.amount_due,
    currency: (invoice.currency ?? 'eur').toLowerCase(),
    lineItems,
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdfUrl: invoice.invoice_pdf ?? null,
  });
  try {
    await mailer.sendEmail({ from: mailer.platformFrom, to, subject, html });
  } catch (e) {
    console.warn('[billing] invoice email send failed:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * One-off `payment` Checkout sessions don't create invoices by default. Build a synthetic
 * invoice-shaped receipt from the session and send it so the user has a record either way.
 */
async function sendReceiptForCheckoutSession(session: Stripe.Checkout.Session, fallbackEmail?: string | null): Promise<void> {
  const mailer = getInvoiceMailer();
  if (!mailer) return;
  // Don't double-send when Stripe has already (or will) generate an invoice for the session.
  if (session.invoice) return;

  const to = session.customer_details?.email ?? fallbackEmail ?? null;
  if (!to) return;

  // Pull line items so we have a friendly description + amount.
  let lineItems: InvoiceLineItem[] = [];
  try {
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 25 });
    lineItems = items.data.map((li) => ({
      description: li.description ?? 'Покупка',
      amountCents: li.amount_total ?? 0,
      currency: (li.currency ?? session.currency ?? 'eur').toLowerCase(),
    }));
  } catch (e) {
    console.warn('[billing] could not load checkout line items for receipt:', e instanceof Error ? e.message : String(e));
  }

  const totalCents = session.amount_total ?? lineItems.reduce((sum, l) => sum + l.amountCents, 0);
  if (totalCents <= 0) return;

  const { subject, html } = buildInvoiceEmail({
    invoiceNumber: null,
    paidAt: new Date(((session.created ?? Math.floor(Date.now() / 1000))) * 1000),
    totalCents,
    currency: (session.currency ?? 'eur').toLowerCase(),
    lineItems,
    hostedInvoiceUrl: null,
    invoicePdfUrl: null,
  });
  try {
    await mailer.sendEmail({ from: mailer.platformFrom, to, subject, html });
  } catch (e) {
    console.warn('[billing] receipt email send failed:', e instanceof Error ? e.message : String(e));
  }
}

function firstPartyRootDomain(): string | null {
  const raw = (process.env.FIRST_PARTY_ROOT_DOMAIN ?? '').trim().toLowerCase();
  return raw.length > 0 ? raw : null;
}

/**
 * Auto-assign a friendly random first-party subdomain to a paid project that doesn't
 * already have a customDomain. No-op if the env var isn't set or the project already
 * has a domain configured.
 */
async function ensureAutoSubdomain(projectId: string): Promise<void> {
  const root = firstPartyRootDomain();
  if (!root) return;
  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    select: { customDomain: true },
  });
  if (!existing || existing.customDomain) return;
  const slug = await reserveRandomSubdomain(projectId, root);
  if (!slug) return;
  await prisma.project.update({
    where: { id: projectId },
    data: {
      customDomain: `${slug}.${root}`,
      customDomainVerifiedAt: new Date(),
      domainVerificationToken: null,
    },
  });
}

function tokenTopupPackTokens(): number {
  const raw = parseInt(process.env.TOKEN_TOPUP_PACK_TOKENS ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 250_000;
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

/**
 * Public base URL for redirects back into the app (scheme + host [+ optional port]).
 *
 * Historically STRIPE_SUCCESS_URL was used as a base, but in dev it may be set to a deep link
 * like "http://localhost/billing?success=true", which would break redirect URLs when we append
 * "/preview/..." (producing ".../billing?success=true/preview/...").
 */
function appBaseUrl(): string {
  const explicit = (process.env.APP_BASE_URL ?? '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const success = (process.env.STRIPE_SUCCESS_URL ?? '').trim();
  if (success) return success.replace(/\/billing.*$/, '').replace(/\/+$/, '');

  const cancel = (process.env.STRIPE_CANCEL_URL ?? '').trim();
  if (cancel) return cancel.replace(/\/pricing.*$/, '').replace(/\/+$/, '');

  return 'http://localhost';
}

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
  const baseUrl = appBaseUrl();

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
  const baseUrl = appBaseUrl();

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
    success_url: `${baseUrl}/preview/${projectId}?paid=true`,
    cancel_url: `${baseUrl}/preview/${projectId}`,
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
  if (isHostingActive(project)) throw new AppError(400, 'Project already hosted');

  const customerId = await getOrCreateCustomer(userId, email);
  const baseUrl = appBaseUrl();

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
    success_url: `${baseUrl}/preview/${projectId}?hosted=true`,
    cancel_url: `${baseUrl}/preview/${projectId}`,
    metadata: { userId, projectId, type: 'hosting' },
  });

  return { url: session.url };
}

/**
 * Monthly "Improvement Plan" subscription — €20/mo, grants MONTHLY_TOKEN_LIMIT tokens per period.
 * Uses inline price_data so no Stripe dashboard setup is required.
 */
export async function createIterationPlanCheckout(userId: string, email: string) {
  const customerId = await getOrCreateCustomer(userId, email);
  const baseUrl = appBaseUrl();

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Web Work Improvement Plan',
            description: 'Monthly quota for AI-powered improvements to your site',
          },
          unit_amount: priceInCents('PRICE_ITERATION_PLAN_CENTS', 2000),
          recurring: { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/billing?plan_active=true`,
    cancel_url: `${baseUrl}/billing`,
    metadata: { userId, type: 'iteration_plan' },
    subscription_data: { metadata: { userId, type: 'iteration_plan' } },
  });

  return { url: session.url };
}

/**
 * Cancel the user's improvement-plan subscription at period end. Stripe keeps it active through
 * the end of the paid period; the webhook flips status to 'canceled' when it actually ends.
 */
export async function cancelIterationPlan(userId: string): Promise<{ cancelAt: Date | null }> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.iterationSubStripeId) {
    throw new AppError(400, 'No active improvement plan to cancel');
  }
  const sub = await stripe.subscriptions.update(user.iterationSubStripeId, {
    cancel_at_period_end: true,
  });
  await prisma.user.update({
    where: { id: userId },
    data: { iterationSubCancelAtPeriodEnd: true },
  });
  return { cancelAt: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null };
}

/**
 * One-off Token Top-Up — €5 buys TOKEN_TOPUP_PACK_TOKENS (default 250k) tokens. The UI never
 * surfaces the raw token count, only the price. Uses inline price_data so no Stripe dashboard
 * setup is required.
 */
export async function createTokenTopupCheckout(userId: string, email: string) {
  const customerId = await getOrCreateCustomer(userId, email);
  const baseUrl = appBaseUrl();
  const tokens = tokenTopupPackTokens();

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Improvement Top-Up',
            description: 'One-off extension to your improvement quota',
          },
          unit_amount: priceInCents('TOKEN_TOPUP_PACK_CENTS', 500),
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/billing?topup=true`,
    cancel_url: `${baseUrl}/billing`,
    metadata: { userId, type: 'token_topup', tokens: String(tokens) },
  });

  return { url: session.url };
}

/**
 * Unified iteration credits checkout.
 * Pricing: €1.50 per credit, capped at €20 for 20 (best value).
 * quantity must be 1–20.
 *
 * @deprecated Retired in favour of the €20/mo iteration-plan subscription.
 */
export async function createIterationCheckout(userId: string, email: string, projectId: string, quantity: number) {
  if (quantity < 1 || quantity > 20) throw new AppError(400, 'Quantity must be between 1 and 20');

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { session: true },
  });

  if (project.session.userId !== userId) throw new AppError(403, 'Forbidden');

  const customerId = await getOrCreateCustomer(userId, email);
  const baseUrl = process.env.STRIPE_SUCCESS_URL?.replace(/\/billing.*$/, '') ?? 'http://localhost';

  // €1.50 each, but a full pack of 20 is capped at €20
  const singleCents = priceInCents('PRICE_ITERATION_SINGLE_CENTS', 150);
  const packCents   = priceInCents('PRICE_ITERATION_PACK_CENTS', 2000);
  const totalCents  = quantity === 20 ? packCents : quantity * singleCents;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: quantity === 1 ? 'Едно подобрение' : `${quantity} подобрения`,
          description: `${quantity} AI-powered improvement${quantity === 1 ? '' : 's'} to your app`,
        },
        unit_amount: totalCents,
      },
      quantity: 1,
    }],
    success_url: `${baseUrl}/preview/${projectId}?iteration_paid=true`,
    cancel_url: `${baseUrl}/preview/${projectId}`,
    metadata: { userId, projectId, type: 'iteration_credits', quantity: String(quantity) },
  });

  return { url: session.url };
}

export async function createPortalSession(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.stripeCustomerId) throw new AppError(400, 'No billing account found');

  const baseUrl = appBaseUrl();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: baseUrl,
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

  const existing = await prisma.processedStripeEvent.findUnique({ where: { id: event.id } });
  if (existing) return;
  await prisma.processedStripeEvent.create({ data: { id: event.id } });

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const { type, projectId } = session.metadata ?? {};

      // Look up the user's email for receipt fallback (subscriptions usually email via invoice.paid).
      let userEmail: string | null = null;
      const userIdMeta = session.metadata?.userId;
      if (userIdMeta) {
        const u = await prisma.user.findUnique({ where: { id: userIdMeta }, select: { email: true } });
        userEmail = u?.email ?? null;
      }

      // Send a receipt for one-off `payment` purchases — Stripe doesn't auto-issue an invoice.
      if (session.mode === 'payment') {
        sendReceiptForCheckoutSession(session, userEmail).catch(() => {});
      }

      if (type === 'generation' && session.metadata?.sessionId) {
        await prisma.session.update({
          where: { id: session.metadata.sessionId },
          data: { generationPurchased: true, sitePurchaseExtrasPending: true },
        });
        // If a project row already exists (retry path), apply bundle immediately.
        const existing = await prisma.project.findUnique({
          where: { sessionId: session.metadata.sessionId },
        });
        if (existing && !existing.includesSitePurchaseBundle) {
          const hostingFreeUntil = extendHostingFreeUntil(
            existing.hostingFreeUntil,
            SITE_PURCHASE_FREE_HOSTING_DAYS,
          );
          await prisma.project.update({
            where: { id: existing.id },
            data: {
              paidIterationCredits: { increment: SITE_PURCHASE_BONUS_ITERATIONS },
              hostingFreeUntil,
              hosted: true,
              includesSitePurchaseBundle: true,
            },
          });
          await prisma.session.update({
            where: { id: session.metadata.sessionId },
            data: { sitePurchaseExtrasPending: false },
          });
          await ensureAutoSubdomain(existing.id);
        }
      }

      if (type === 'project' && projectId) {
        const proj = await prisma.project.findUnique({ where: { id: projectId } });
        const hostingFreeUntil = extendHostingFreeUntil(
          proj?.hostingFreeUntil ?? null,
          SITE_PURCHASE_FREE_HOSTING_DAYS,
        );
        await prisma.project.update({
          where: { id: projectId },
          data: {
            paid: true,
            paidIterationCredits: { increment: SITE_PURCHASE_BONUS_ITERATIONS },
            hostingFreeUntil,
            hosted: true,
          },
        });
        await ensureAutoSubdomain(projectId);
      }

      if (type === 'iteration_credits' && projectId) {
        const qty = parseInt(session.metadata?.quantity ?? '1', 10);
        await prisma.project.update({
          where: { id: projectId },
          data: { paidIterationCredits: { increment: isNaN(qty) ? 1 : qty } },
        });
      }

      if (type === 'token_topup' && session.metadata?.userId) {
        const tokens = parseInt(session.metadata.tokens ?? '', 10);
        const amount = Number.isFinite(tokens) && tokens > 0 ? tokens : tokenTopupPackTokens();
        await grantTokens({
          userId: session.metadata.userId,
          tokens: amount,
          reason: 'topup_purchase',
          stripeSessionId: session.id,
          note: `Stripe top-up (${amount.toLocaleString('en-US')} tokens)`,
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

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      if (isIterationPlanSubscription(sub)) {
        await upsertIterationSubscription(sub);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;

      if (isIterationPlanSubscription(sub)) {
        await prisma.user.updateMany({
          where: { iterationSubStripeId: sub.id },
          data: {
            iterationSubStatus: 'canceled',
            iterationSubCancelAtPeriodEnd: false,
            iterationSubCurrentPeriodStart: null,
            iterationSubCurrentPeriodEnd: null,
          },
        });
        break;
      }

      const cancelled = await prisma.project.findMany({
        where: { hostingSubscriptionId: sub.id },
        select: { id: true },
      });
      for (const p of cancelled) {
        await stopPersistentHosting(p.id).catch(() => {});
      }
      await prisma.project.updateMany({
        where: { hostingSubscriptionId: sub.id },
        data: { hosted: false, hostingSubscriptionId: null, runPort: null },
      });
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;

      // Always email a receipt for paid invoices (covers subscription renewals and any
      // payment-mode session where invoice_creation is enabled).
      sendInvoiceEmailFromStripeInvoice(invoice).catch(() => {});

      // On renewal, Stripe emits `customer.subscription.updated` as well, so this is mostly
      // belt-and-braces for subs whose period window moved.
      const subId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
      if (!subId) break;
      const sub = await stripe.subscriptions.retrieve(subId);
      if (isIterationPlanSubscription(sub)) {
        await upsertIterationSubscription(sub);
      }
      break;
    }
  }
}

/**
 * A subscription is the improvement plan when its metadata says so. We tag `type: 'iteration_plan'`
 * on both the Checkout session and `subscription_data.metadata` at creation time.
 */
function isIterationPlanSubscription(sub: Stripe.Subscription): boolean {
  return sub.metadata?.type === 'iteration_plan';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Listing helpers for the Settings billing card
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceSummary {
  id: string;
  number: string | null;
  status: string;
  /** Amount in euro cents (Stripe's smallest unit). */
  amount: number;
  currency: string;
  /** Unix seconds when the invoice was paid (or created if pending). */
  date: number;
  description: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
}

export interface SubscriptionSummary {
  id: string;
  /** "improvement_plan" | "hosting" | "other" */
  kind: 'improvement_plan' | 'hosting' | 'other';
  /** Human label for the UI (e.g. "Improvement plan", "Hosting — myproject.example.com"). */
  label: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  /** Per-cycle amount in cents (taken from the first item). */
  amount: number | null;
  currency: string | null;
  interval: 'day' | 'week' | 'month' | 'year' | null;
  /** Project this subscription is tied to, when it's a per-project hosting sub. */
  projectId: string | null;
}

/** List the user's Stripe invoices (most recent first). Empty array when no Stripe customer yet. */
export async function listInvoicesForUser(userId: string, limit = 20): Promise<InvoiceSummary[]> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.stripeCustomerId) return [];

  const result = await stripe.invoices.list({
    customer: user.stripeCustomerId,
    limit: Math.max(1, Math.min(100, limit)),
  });

  return result.data.map((inv) => ({
    id: inv.id,
    number: inv.number ?? null,
    status: inv.status ?? 'unknown',
    amount: typeof inv.amount_paid === 'number' && inv.amount_paid > 0 ? inv.amount_paid : (inv.amount_due ?? 0),
    currency: (inv.currency ?? 'eur').toLowerCase(),
    date: (inv.status_transitions?.paid_at ?? inv.status_transitions?.finalized_at ?? inv.created) ?? inv.created,
    description: inv.lines?.data?.[0]?.description ?? null,
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    invoicePdf: inv.invoice_pdf ?? null,
  }));
}

/**
 * List the user's active/recent subscriptions. Returns the improvement plan (when present)
 * and per-project hosting subscriptions (joined to the project for a friendly label).
 */
export async function listSubscriptionsForUser(userId: string): Promise<SubscriptionSummary[]> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.stripeCustomerId) return [];

  const stripeSubs = await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    status: 'all',
    limit: 30,
  });

  // Map any per-project hosting subs by stripe sub id so we can label them.
  const hostingSubIds = stripeSubs.data
    .filter((s) => s.metadata?.type !== 'iteration_plan')
    .map((s) => s.id);
  const hostedProjects = hostingSubIds.length > 0
    ? await prisma.project.findMany({
        where: { hostingSubscriptionId: { in: hostingSubIds } },
        select: { id: true, hostingSubscriptionId: true, customDomain: true },
      })
    : [];
  const byHostingSub = new Map(hostedProjects.map((p) => [p.hostingSubscriptionId!, p]));

  return stripeSubs.data
    // Skip very old fully-canceled subs to keep the UI clean.
    .filter((s) => s.status !== 'incomplete_expired')
    .map((s) => {
      const isImprovement = s.metadata?.type === 'iteration_plan';
      const item = s.items.data[0];
      const price = item?.price;
      const project = byHostingSub.get(s.id) ?? null;

      let label: string;
      let kind: SubscriptionSummary['kind'];
      if (isImprovement) {
        kind = 'improvement_plan';
        label = 'Improvement plan';
      } else if (project) {
        kind = 'hosting';
        label = project.customDomain
          ? `Hosting — ${project.customDomain}`
          : `Hosting — project ${project.id.slice(0, 8)}`;
      } else {
        kind = 'other';
        label = (item?.price?.product as { name?: string } | null)?.name ?? 'Subscription';
      }

      return {
        id: s.id,
        kind,
        label,
        status: s.status,
        cancelAtPeriodEnd: !!s.cancel_at_period_end,
        currentPeriodStart: s.current_period_start ?? null,
        currentPeriodEnd: s.current_period_end ?? null,
        amount: price?.unit_amount ?? null,
        currency: price?.currency ?? null,
        interval: (price?.recurring?.interval as SubscriptionSummary['interval']) ?? null,
        projectId: project?.id ?? null,
      };
    })
    .sort((a, b) => (b.currentPeriodEnd ?? 0) - (a.currentPeriodEnd ?? 0));
}

async function upsertIterationSubscription(sub: Stripe.Subscription): Promise<void> {
  const userId = sub.metadata?.userId;
  if (!userId) {
    console.warn('[billing] iteration sub without userId metadata', { subId: sub.id });
    return;
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      iterationSubStripeId: sub.id,
      iterationSubStatus: sub.status,
      iterationSubCancelAtPeriodEnd: !!sub.cancel_at_period_end,
      iterationSubCurrentPeriodStart: sub.current_period_start
        ? new Date(sub.current_period_start * 1000)
        : null,
      iterationSubCurrentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null,
    },
  });
}

