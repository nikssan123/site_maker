import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';

import authRouter from './routes/auth';
import chatRouter from './routes/chat';
import planRouter from './routes/plan';
import generateRouter from './routes/generate';
import iterateRouter from './routes/iterate';
import previewRouter from './routes/preview';
import billingRouter from './routes/billing';
import sessionsRouter from './routes/sessions';
import analyticsRouter from './routes/analytics';
import projectPaymentsRouter from './routes/projectPayments';
import internalRouter from './routes/internal';
import emailRouter from './routes/email';
import adminRouter from './routes/admin';
import supportRouter from './routes/support';
import { errorHandler } from './middleware/errorHandler';
import { startEmailQueue, stopEmailQueue } from './services/emailQueue';
import { stopPersistentHosting } from './services/appRunner';

export const prisma = new PrismaClient();

const app = express();

// Trust Caddy as the first reverse proxy (required for correct req.ip)
app.set('trust proxy', 1);

// Rate limiting (replaces Nginx limit_req zones)
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
});
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authLimiter);
app.use('/api/generate', aiLimiter);
app.use('/api/iterate', aiLimiter);
app.use('/api/', apiLimiter);

// Stripe webhook needs raw body — mount before express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
// Resend webhook needs raw body for signature verification.
app.use('/api/email/webhook', express.raw({ type: '*/*' }));

app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: true, credentials: true }));

app.use('/api/auth', authRouter);
app.use('/api/chat', chatRouter);
app.use('/api/plan', planRouter);
app.use('/api/generate', generateRouter);
app.use('/api/iterate', iterateRouter);
app.use('/api/preview', previewRouter);
app.use('/api/billing', billingRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/project-payments', projectPaymentsRouter);
app.use('/api/internal', internalRouter);
app.use('/api/email', emailRouter);
app.use('/api/admin', adminRouter);
app.use('/api/support', supportRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use(errorHandler);

const PORT = process.env.PORT ?? 4000;

const EVENT_PRUNE_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const EVENT_MAX_AGE_DAYS = 30;

async function pruneOldEvents() {
  try {
    const cutoff = new Date(Date.now() - EVENT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    const { count } = await prisma.generationEvent.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        session: { status: { in: ['planning', 'error'] } },
      },
    });
    if (count > 0) console.log(`[prune] deleted ${count} old GenerationEvent rows`);
  } catch (err) {
    console.error('[prune] GenerationEvent cleanup failed:', err);
  }
}

async function pruneOldStripeEvents() {
  try {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await prisma.processedStripeEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  } catch { /* non-critical */ }
}

const HOSTING_SWEEP_INTERVAL = 60 * 60 * 1000; // 1 hour

async function sweepExpiredHosting() {
  try {
    const expired = await prisma.project.findMany({
      where: {
        hosted: true,
        hostingSubscriptionId: null,
        hostingFreeUntil: { lt: new Date() },
      },
      select: { id: true },
    });
    for (const p of expired) {
      console.log(`[hosting-sweep] stopping expired project ${p.id}`);
      await stopPersistentHosting(p.id).catch(() => {});
      await prisma.project.update({
        where: { id: p.id },
        data: { hosted: false, runPort: null },
      });
    }
    if (expired.length > 0) {
      console.log(`[hosting-sweep] stopped ${expired.length} expired project(s)`);
    }
  } catch (err) {
    console.error('[hosting-sweep] failed:', err);
  }
}

async function main() {
  await prisma.$connect();
  console.log('Database connected');
  await startEmailQueue(prisma);
  setInterval(() => { pruneOldEvents(); pruneOldStripeEvents(); }, EVENT_PRUNE_INTERVAL);
  setInterval(sweepExpiredHosting, HOSTING_SWEEP_INTERVAL);
  sweepExpiredHosting();
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function shutdown() {
  try {
    await stopEmailQueue();
  } catch (e) {
    console.error('Email queue shutdown error', e);
  }
  try {
    await prisma.$disconnect();
  } catch (e) {
    console.error('Prisma disconnect error', e);
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
