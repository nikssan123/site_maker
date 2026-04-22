import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index';
import { requireAuth } from '../middleware/requireAuth';
import { AppError } from '../middleware/errorHandler';
import { EmailService } from '../services/emailService';
import { isHostingActive } from '../lib/hostingActive';

const router = Router();
const emailSvc = new EmailService();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeDomain(v: string): string {
  return v.toLowerCase().trim().replace(/\.$/, '');
}

function domainOfEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

async function requireOwnedProject(projectId: string, userId: string) {
  if (!UUID_RE.test(projectId)) throw new AppError(400, 'Invalid project id');
  return prisma.project.findFirstOrThrow({
    where: { id: projectId, session: { userId } },
    select: {
      id: true,
      hostingFreeUntil: true,
      hostingSubscriptionId: true,
    },
  });
}

// --- Domains ---

router.post('/domains', requireAuth, async (req, res, next) => {
  try {
    const { projectId, domain } = z
      .object({
        projectId: z.string(),
        domain: z.string().min(1).max(253),
      })
      .parse(req.body);

    const project = await requireOwnedProject(projectId, req.user.userId);
    if (!isHostingActive(project)) {
      throw new AppError(402, 'Hosting required for custom email domains', 'upgrade_required');
    }

    const name = normalizeDomain(domain);
    const created = await emailSvc.createDomain(name);

    const row = await prisma.emailDomain.create({
      data: {
        projectId: project.id,
        domain: name,
        resendDomainId: created.id,
        dnsRecords: created.records,
        provider: 'resend',
      },
      select: { id: true, domain: true, verified: true, dnsRecords: true },
    });

    return res.json({
      id: row.id,
      domain: row.domain,
      verified: row.verified,
      dnsRecords: row.dnsRecords,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/domains/:domainId/verify', requireAuth, async (req, res, next) => {
  try {
    const domainId = String(req.params.domainId ?? '');
    if (!UUID_RE.test(domainId)) throw new AppError(400, 'Invalid domain id');

    const domain = await prisma.emailDomain.findFirstOrThrow({
      where: { id: domainId, project: { session: { userId: req.user.userId } } },
      select: { id: true, resendDomainId: true },
    });

    const result = await emailSvc.verifyDomain(domain.resendDomainId);

    if (result.verified) {
      await prisma.emailDomain.update({
        where: { id: domain.id },
        data: { verified: true, verifiedAt: new Date() },
      });
    }

    return res.json({ verified: result.verified });
  } catch (err) {
    return next(err);
  }
});

router.get('/domains', requireAuth, async (req, res, next) => {
  try {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    if (projectId && !UUID_RE.test(projectId)) throw new AppError(400, 'Invalid project id');

    const domains = await prisma.emailDomain.findMany({
      where: projectId
        ? { projectId, project: { session: { userId: req.user.userId } } }
        : { project: { session: { userId: req.user.userId } } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        projectId: true,
        domain: true,
        verified: true,
        verifiedAt: true,
        dnsRecords: true,
        createdAt: true,
      },
    });

    return res.json(
      domains.map((d) => ({
        ...d,
        verifiedAt: d.verifiedAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
      })),
    );
  } catch (err) {
    return next(err);
  }
});

router.delete('/domains/:domainId', requireAuth, async (req, res, next) => {
  try {
    const domainId = String(req.params.domainId ?? '');
    if (!UUID_RE.test(domainId)) throw new AppError(400, 'Invalid domain id');

    const domain = await prisma.emailDomain.findFirstOrThrow({
      where: { id: domainId, project: { session: { userId: req.user.userId } } },
      select: { id: true, resendDomainId: true },
    });

    await emailSvc.deleteDomain(domain.resendDomainId);
    await prisma.emailDomain.delete({ where: { id: domain.id } });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// --- Email settings ---

router.get('/settings/:projectId', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId ?? '');
    await requireOwnedProject(projectId, req.user.userId);

    const settings = await prisma.emailSettings.findUnique({
      where: { projectId },
      include: { domain: { select: { id: true, domain: true, verified: true } } },
    });
    if (!settings) {
      return res.json({
        projectId,
        domainId: null,
        domain: null,
        fromName: null,
        fromEmail: emailSvc.platformFrom,
        platformFromEmail: emailSvc.platformFrom,
        verified: true,
        provider: 'resend',
      });
    }

    return res.json({
      projectId: settings.projectId,
      domainId: settings.domainId,
      domain: settings.domain?.domain ?? null,
      fromName: settings.fromName ?? null,
      fromEmail: settings.fromEmail,
      platformFromEmail: emailSvc.platformFrom,
      verified: settings.domain?.verified ?? false,
      provider: 'resend',
    });
  } catch (err) {
    return next(err);
  }
});

router.put('/settings/:projectId', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId ?? '');
    await requireOwnedProject(projectId, req.user.userId);

    const { fromName, fromEmail, domainId } = z
      .object({
        fromName: z.string().max(100).optional(),
        fromEmail: z.string().min(3).max(320),
        domainId: z.string().optional().nullable(),
      })
      .parse(req.body);

    const chosenDomainId = domainId ? String(domainId) : null;

    let chosenDomain: { id: string; domain: string; verified: boolean } | null = null;
    if (chosenDomainId) {
      if (!UUID_RE.test(chosenDomainId)) throw new AppError(400, 'Invalid domain id');
      chosenDomain = await prisma.emailDomain.findFirstOrThrow({
        where: { id: chosenDomainId, projectId, project: { session: { userId: req.user.userId } } },
        select: { id: true, domain: true, verified: true },
      });
    }

    const from = String(fromEmail).trim().toLowerCase();
    const fromDomain = domainOfEmail(from);
    if (!fromDomain) throw new AppError(400, 'Invalid fromEmail');

    if (chosenDomain) {
      if (fromDomain !== chosenDomain.domain.toLowerCase()) {
        throw new AppError(400, 'fromEmail must match the selected domain');
      }
      if (!chosenDomain.verified) {
        // allow saving settings, but verified=false until domain verifies
      }
    } else {
      // no custom domain selected: must be platform sender domain
      const platformFromDomain = domainOfEmail(emailSvc.platformFrom);
      if (platformFromDomain && fromDomain !== platformFromDomain) {
        throw new AppError(400, 'fromEmail must use the platform domain when no custom domain is selected');
      }
    }

    const settings = await prisma.emailSettings.upsert({
      where: { projectId },
      create: {
        projectId,
        provider: 'resend',
        fromName: fromName?.trim() || null,
        fromEmail: from,
        domainId: chosenDomain?.id ?? null,
        verified: chosenDomain?.verified ?? true,
      },
      update: {
        fromName: fromName?.trim() || null,
        fromEmail: from,
        domainId: chosenDomain?.id ?? null,
        verified: chosenDomain?.verified ?? true,
      },
      select: { projectId: true, fromName: true, fromEmail: true, domainId: true, verified: true },
    });

    return res.json({
      ...settings,
      platformFromEmail: emailSvc.platformFrom,
      provider: 'resend',
    });
  } catch (err) {
    return next(err);
  }
});

// --- Templates ---

router.get('/templates/:projectId', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId ?? '');
    await requireOwnedProject(projectId, req.user.userId);

    const templates = await prisma.emailTemplate.findMany({
      where: { projectId },
      orderBy: { eventType: 'asc' },
      select: { id: true, eventType: true, subject: true, htmlBody: true, updatedAt: true },
    });

    return res.json(
      templates.map((t) => ({
        ...t,
        updatedAt: t.updatedAt.toISOString(),
      })),
    );
  } catch (err) {
    return next(err);
  }
});

router.put('/templates/:projectId/:eventType', requireAuth, async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId ?? '');
    const eventType = String(req.params.eventType ?? '').trim();
    await requireOwnedProject(projectId, req.user.userId);
    if (!eventType) throw new AppError(400, 'eventType is required');

    const { subject, htmlBody } = z
      .object({
        subject: z.string().min(1).max(200),
        htmlBody: z.string().min(1).max(200_000),
      })
      .parse(req.body);

    const template = await prisma.emailTemplate.upsert({
      where: { projectId_eventType: { projectId, eventType } },
      create: { projectId, eventType, subject, htmlBody },
      update: { subject, htmlBody },
      select: { id: true, projectId: true, eventType: true, subject: true, htmlBody: true, updatedAt: true },
    });

    return res.json({ ...template, updatedAt: template.updatedAt.toISOString() });
  } catch (err) {
    return next(err);
  }
});

// --- Webhook ---
//
// Note: The raw-body mounting is done in backend/src/index.ts (similar to Stripe).
// Here we assume req.body is a Buffer.

router.post('/webhook', async (req, res, next) => {
  try {
    const secret = (process.env.RESEND_WEBHOOK_SECRET ?? '').trim();
    if (!secret) {
      console.warn('[resend-webhook] RESEND_WEBHOOK_SECRET is not configured; acknowledging webhook without verification.');
      return res.status(200).json({ ok: true, skipped: 'missing_webhook_secret' });
    }

    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {});
    const id = String(req.header('svix-id') ?? '');
    const timestamp = String(req.header('svix-timestamp') ?? '');
    const signature = String(req.header('svix-signature') ?? '');
    if (!id || !timestamp || !signature) {
      throw new AppError(400, 'Missing webhook headers');
    }

    let event: any;
    try {
      event = (emailSvc as unknown as { resend: any }).resend.webhooks.verify({
        payload,
        headers: { id, timestamp, signature },
        secret,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/secret can't be empty/i.test(message)) {
        console.warn('[resend-webhook] Resend rejected webhook secret as empty; check RESEND_WEBHOOK_SECRET.');
        return res.status(200).json({ ok: true, skipped: 'invalid_webhook_secret' });
      }
      throw err;
    }

    const type = String(event?.type ?? '');
    const data = event?.data ?? {};
    const messageId = String(data?.email_id ?? data?.id ?? '');

    if (messageId) {
      const statusMap: Record<string, string> = {
        'email.delivered': 'delivered',
        'email.bounced': 'bounced',
        'email.complained': 'complained',
        'email.opened': 'opened',
      };
      const nextStatus = statusMap[type];
      if (nextStatus) {
        await prisma.emailLog.updateMany({
          where: { resendMessageId: messageId },
          data: { status: nextStatus },
        });
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

export default router;
