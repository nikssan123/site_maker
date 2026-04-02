import express from 'express';
import cors from 'cors';
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
import { errorHandler } from './middleware/errorHandler';

export const prisma = new PrismaClient();

const app = express();

// Stripe webhook needs raw body — mount before express.json()
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

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

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use(errorHandler);

const PORT = process.env.PORT ?? 4000;

async function main() {
  await prisma.$connect();
  console.log('Database connected');
  app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
