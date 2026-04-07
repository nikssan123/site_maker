import PgBoss from 'pg-boss';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';
import { EmailService } from './emailService';

export type SendEmailJob = {
  projectId: string;
  to: string;
  subject: string;
  html: string;
  eventType?: string;
  templateId?: string;
};

let boss: PgBoss | null = null;

function mustEnv(name: string): string {
  const v = (process.env[name] ?? '').trim();
  if (!v) throw new AppError(500, `Missing environment variable: ${name}`);
  return v;
}

function maxDailyEmails(): number {
  const raw = (process.env.MAX_PROJECT_EMAILS_PER_DAY ?? '').trim();
  const n = raw ? Number(raw) : 100;
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.floor(n);
}

function isValidEmailish(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function extractDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

export async function startEmailQueue(prisma: PrismaClient): Promise<void> {
  if (boss) return;

  const connectionString = mustEnv('DATABASE_URL');
  const b = new PgBoss({
    connectionString,
    application_name: 'project-maker',
    // Default polling is fine for email; keep conservative to reduce DB load.
    monitorStateIntervalSeconds: 30,
  });

  await b.start();

  const emailSvc = new EmailService();

  await b.work<SendEmailJob>('send-email', async (job) => {
      const payload = (job as unknown as { data: SendEmailJob }).data;
      if (!payload?.projectId || !payload?.to || !payload?.subject || !payload?.html) {
        throw new AppError(400, 'Invalid job payload');
      }
      if (!isValidEmailish(payload.to)) throw new AppError(400, 'Invalid recipient email');

      const project = await prisma.project.findUnique({
        where: { id: payload.projectId },
        select: {
          id: true,
          emailSettings: {
            select: {
              id: true,
              fromName: true,
              fromEmail: true,
              domain: { select: { id: true, domain: true, verified: true } },
            },
          },
        },
      });
      if (!project) throw new AppError(404, 'Project not found');

      let from = emailSvc.platformFrom;
      const settings = project.emailSettings;
      if (settings?.domain?.verified) {
        const candidate = String(settings.fromEmail ?? '').trim();
        if (candidate && isValidEmailish(candidate)) {
          const emailDomain = extractDomain(candidate);
          if (emailDomain && emailDomain === String(settings.domain.domain ?? '').toLowerCase()) {
            from = candidate;
          }
        }
      }

      const log = await prisma.emailLog.create({
        data: {
          projectId: project.id,
          to: payload.to,
          from,
          subject: payload.subject,
          status: 'queued',
        },
        select: { id: true },
      });

      try {
        const messageId = await emailSvc.sendEmail({
          from,
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
        });

        await prisma.emailLog.update({
          where: { id: log.id },
          data: {
            status: 'sent',
            resendMessageId: messageId,
            sentAt: new Date(),
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.emailLog.update({
          where: { id: log.id },
          data: { status: 'failed', error: msg.slice(0, 5000) },
        });
        throw err;
      }
    });

  boss = b;
  console.log('[emailQueue] started');
}

export async function stopEmailQueue(): Promise<void> {
  const b = boss;
  boss = null;
  if (b) {
    await b.stop({ graceful: true, timeout: 10_000 });
  }
}

export async function sendProjectEmail(
  prisma: PrismaClient,
  projectId: string,
  to: string,
  subject: string,
  html: string,
  meta?: { eventType?: string; templateId?: string },
): Promise<void> {
  if (!boss) throw new AppError(500, 'Email queue not started');
  const pid = String(projectId ?? '').trim();
  const toEmail = String(to ?? '').trim();
  const subj = String(subject ?? '').trim();
  const body = String(html ?? '').trim();

  if (!pid || !toEmail || !subj || !body) throw new AppError(400, 'Missing email fields');
  if (!isValidEmailish(toEmail)) throw new AppError(400, 'Invalid recipient email');

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.emailLog.count({
    where: { projectId: pid, createdAt: { gte: since } },
  });
  if (count >= maxDailyEmails()) {
    throw new AppError(429, 'Daily email limit reached');
  }

  await boss.send('send-email', {
    projectId: pid,
    to: toEmail,
    subject: subj,
    html: body,
    eventType: meta?.eventType,
    templateId: meta?.templateId,
  } satisfies SendEmailJob, {
    retryLimit: 3,
    retryBackoff: true,
    expireInSeconds: 60 * 60 * 24,
  });
}

