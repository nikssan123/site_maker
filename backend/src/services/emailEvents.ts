import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { sendProjectEmail } from './emailQueue';

export type EmailEventType = 'user.signup' | 'form.submitted' | 'booking.created' | 'order.created' | 'payment.received';

type Locale = 'bg' | 'en';

function interpolate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => data[key] ?? '');
}

function normalizeLocale(value: string | undefined): Locale {
  const v = String(value ?? '').toLowerCase().slice(0, 2);
  return v === 'en' ? 'en' : 'bg';
}

const DEFAULT_TEMPLATES: Record<Locale, Record<EmailEventType, { subject: string; html: string }>> = {
  bg: {
    'user.signup': {
      subject: 'Добре дошли!',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2 style="margin:0 0 12px">Добре дошли, {{name}}!</h2>
          <p>Благодарим ви, че създадохте профил при нас. Радваме се, че сте тук.</p>
          <p>Ако имате въпроси, просто отговорете на този имейл.</p>
        </div>
      `.trim(),
    },
    'form.submitted': {
      subject: 'Ново запитване от контактната форма',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2 style="margin:0 0 12px">Ново запитване</h2>
          <p>Получихте ново съобщение през контактната форма на сайта.</p>
          <p><strong>Име:</strong> {{name}}</p>
          <p><strong>Имейл:</strong> {{email}}</p>
          <p><strong>Съобщение:</strong></p>
          <div style="white-space:pre-wrap;border:1px solid #eee;padding:12px;border-radius:8px;background:#fafafa">{{message}}</div>
        </div>
      `.trim(),
    },
    'booking.created': {
      subject: 'Нова резервация — {{date}} {{time}}',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2 style="margin:0 0 12px">Нова резервация</h2>
          <p>Току-що беше направена нова резервация през сайта.</p>
          <p><strong>Име:</strong> {{name}}</p>
          <p><strong>Имейл:</strong> {{email}}</p>
          <p><strong>Дата:</strong> {{date}}</p>
          <p><strong>Час:</strong> {{time}}</p>
          <p><strong>Бележка:</strong> {{note}}</p>
        </div>
      `.trim(),
    },
    'order.created': {
      subject: 'Нова поръчка — {{amount}} {{currency}}',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2 style="margin:0 0 12px">Нова поръчка</h2>
          <p>Получихте нова поръчка през сайта.</p>
          <p><strong>Име:</strong> {{name}}</p>
          <p><strong>Имейл:</strong> {{email}}</p>
          <p><strong>Обща сума:</strong> {{amount}} {{currency}}</p>
          <p><strong>Продукти / детайли:</strong></p>
          <div style="white-space:pre-wrap;border:1px solid #eee;padding:12px;border-radius:8px;background:#fafafa">{{items}}</div>
        </div>
      `.trim(),
    },
    'payment.received': {
      subject: 'Получено плащане — {{amount}} {{currency}}',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2 style="margin:0 0 12px">Получено плащане</h2>
          <p>Успешно регистрирахме ново плащане.</p>
          <p><strong>Сума:</strong> {{amount}} {{currency}}</p>
          <p><strong>Имейл на клиента:</strong> {{email}}</p>
        </div>
      `.trim(),
    },
  },
  en: {
    'user.signup': {
      subject: 'Welcome!',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2 style="margin:0 0 12px">Welcome, {{name}}!</h2>
          <p>Thanks for creating an account. We're glad to have you.</p>
          <p>If you have any questions, just reply to this email.</p>
        </div>
      `.trim(),
    },
    'form.submitted': {
      subject: 'New contact form inquiry',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2 style="margin:0 0 12px">New inquiry</h2>
          <p>You've received a new message through the contact form on your site.</p>
          <p><strong>Name:</strong> {{name}}</p>
          <p><strong>Email:</strong> {{email}}</p>
          <p><strong>Message:</strong></p>
          <div style="white-space:pre-wrap;border:1px solid #eee;padding:12px;border-radius:8px;background:#fafafa">{{message}}</div>
        </div>
      `.trim(),
    },
    'booking.created': {
      subject: 'New booking — {{date}} {{time}}',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2 style="margin:0 0 12px">New booking</h2>
          <p>A new booking has just been made through your site.</p>
          <p><strong>Name:</strong> {{name}}</p>
          <p><strong>Email:</strong> {{email}}</p>
          <p><strong>Date:</strong> {{date}}</p>
          <p><strong>Time:</strong> {{time}}</p>
          <p><strong>Note:</strong> {{note}}</p>
        </div>
      `.trim(),
    },
    'order.created': {
      subject: 'New order — {{amount}} {{currency}}',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2 style="margin:0 0 12px">New order</h2>
          <p>You've received a new order through your site.</p>
          <p><strong>Name:</strong> {{name}}</p>
          <p><strong>Email:</strong> {{email}}</p>
          <p><strong>Total:</strong> {{amount}} {{currency}}</p>
          <p><strong>Items / details:</strong></p>
          <div style="white-space:pre-wrap;border:1px solid #eee;padding:12px;border-radius:8px;background:#fafafa">{{items}}</div>
        </div>
      `.trim(),
    },
    'payment.received': {
      subject: 'Payment received — {{amount}} {{currency}}',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2 style="margin:0 0 12px">Payment received</h2>
          <p>A new payment has been recorded.</p>
          <p><strong>Amount:</strong> {{amount}} {{currency}}</p>
          <p><strong>Customer email:</strong> {{email}}</p>
        </div>
      `.trim(),
    },
  },
};

const FALLBACK_BY_LOCALE: Record<Locale, { subject: string; html: string }> = {
  bg: { subject: 'Известие', html: `<div>Имате ново известие.</div>` },
  en: { subject: 'Notification', html: `<div>You have a new notification.</div>` },
};

function defaultTemplate(eventType: EmailEventType, locale: Locale): { subject: string; html: string } {
  return DEFAULT_TEMPLATES[locale]?.[eventType] ?? FALLBACK_BY_LOCALE[locale];
}

async function projectOwnerEmail(projectId: string): Promise<string> {
  const proj = await prisma.project.findUnique({
    where: { id: projectId },
    select: { session: { select: { user: { select: { email: true } } } } },
  });
  const email = proj?.session?.user?.email ?? '';
  if (!email) throw new AppError(404, 'Project owner not found');
  return email;
}

export async function triggerEmailEvent(
  projectId: string,
  eventType: string,
  data: Record<string, string>,
): Promise<void> {
  const pid = String(projectId ?? '').trim();
  const type = String(eventType ?? '').trim() as EmailEventType;
  if (!pid) throw new AppError(400, 'projectId is required');
  if (!type) throw new AppError(400, 'eventType is required');

  const templateRow = await prisma.emailTemplate.findUnique({
    where: { projectId_eventType: { projectId: pid, eventType: type } },
    select: { id: true, subject: true, htmlBody: true },
  });

  const locale = normalizeLocale(data.locale);
  const base = templateRow
    ? { subject: templateRow.subject, html: templateRow.htmlBody }
    : defaultTemplate(type, locale);

  const subject = interpolate(base.subject, data);
  const html = interpolate(base.html, data);

  const to =
    type === 'user.signup' && typeof data.email === 'string' && data.email.includes('@')
      ? data.email
      : await projectOwnerEmail(pid);

  await sendProjectEmail(prisma, pid, to, subject, html, {
    eventType: type,
    templateId: templateRow?.id,
  });
}
