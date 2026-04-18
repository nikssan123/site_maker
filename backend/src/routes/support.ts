import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { EmailService } from '../services/emailService';

const router = Router();

const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_PHONE = 40;
const MAX_DESCRIPTION = 4000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Require at least 6 digits; allow +, spaces, dashes, parentheses.
const PHONE_RE = /^[+()\-\s\d]{6,}$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

router.post('/tickets', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const contactEmail = String(req.body?.contactEmail ?? '').trim();
    const contactPhone = String(req.body?.contactPhone ?? '').trim();
    const description = String(req.body?.description ?? '').trim();

    if (!name || !contactEmail || !contactPhone || !description) {
      throw new AppError(400, 'All fields are required');
    }
    if (name.length > MAX_NAME) {
      throw new AppError(400, `Name must be ${MAX_NAME} characters or fewer`);
    }
    if (contactEmail.length > MAX_EMAIL || !EMAIL_RE.test(contactEmail)) {
      throw new AppError(400, 'Invalid email address');
    }
    if (contactPhone.length > MAX_PHONE || !PHONE_RE.test(contactPhone)) {
      throw new AppError(400, 'Invalid phone number');
    }
    if (description.length > MAX_DESCRIPTION) {
      throw new AppError(400, `Description must be ${MAX_DESCRIPTION} characters or fewer`);
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: req.user.userId,
        userEmail: req.user.email,
        name,
        contactEmail,
        contactPhone,
        description,
      },
      select: { id: true, createdAt: true },
    });

    // Best-effort email notification — don't fail the request if email send fails.
    const supportInbox = (process.env.SUPPORT_INBOX_EMAIL ?? '').trim();
    if (supportInbox) {
      try {
        const email = new EmailService();
        const html = `
          <div style="font-family: system-ui, sans-serif; line-height: 1.5;">
            <h2 style="margin: 0 0 12px;">New support ticket</h2>
            <p style="margin: 0 0 4px;"><strong>Name:</strong> ${escapeHtml(name)}</p>
            <p style="margin: 0 0 4px;"><strong>Contact email:</strong> ${escapeHtml(contactEmail)}</p>
            <p style="margin: 0 0 4px;"><strong>Contact phone:</strong> ${escapeHtml(contactPhone)}</p>
            <p style="margin: 0 0 4px;"><strong>Account email:</strong> ${escapeHtml(req.user.email)}</p>
            <p style="margin: 0 0 12px;"><strong>User ID:</strong> ${escapeHtml(req.user.userId)}</p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />
            <pre style="white-space: pre-wrap; font-family: inherit; margin: 0;">${escapeHtml(description)}</pre>
          </div>
        `.trim();
        await email.sendEmail({
          from: email.platformFrom,
          to: supportInbox,
          subject: `[Support] ${name}`,
          html,
        });
      } catch (err) {
        console.error('[support] email notification failed:', err);
      }
    }

    res.status(201).json({ id: ticket.id, createdAt: ticket.createdAt });
  } catch (err) {
    next(err);
  }
});

export default router;
