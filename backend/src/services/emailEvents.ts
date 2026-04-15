import { prisma } from '../index';
import { AppError } from '../middleware/errorHandler';
import { sendProjectEmail } from './emailQueue';

export type EmailEventType = 'user.signup' | 'form.submitted' | 'booking.created' | 'order.created' | 'payment.received';

function interpolate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => data[key] ?? '');
}

function defaultTemplate(eventType: EmailEventType): { subject: string; html: string } {
  switch (eventType) {
    case 'user.signup':
      return {
        subject: 'Добре дошли!',
        html: `
          <div style="font-family:Arial,sans-serif">
            <h2>Добре дошли!</h2>
            <p>Радваме се, че се регистрирахте.</p>
          </div>
        `.trim(),
      };
    case 'form.submitted':
      return {
        subject: 'Ново запитване от контактната форма',
        html: `
          <div style="font-family:Arial,sans-serif">
            <h2>Ново запитване</h2>
            <p><strong>Име:</strong> {{name}}</p>
            <p><strong>Имейл:</strong> {{email}}</p>
            <p><strong>Съобщение:</strong></p>
            <div style="white-space:pre-wrap;border:1px solid #eee;padding:12px;border-radius:8px">{{message}}</div>
          </div>
        `.trim(),
      };
    case 'booking.created':
      return {
        subject: 'Нова резервация',
        html: `
          <div style="font-family:Arial,sans-serif">
            <h2>Нова резервация</h2>
            <p><strong>Име:</strong> {{name}}</p>
            <p><strong>Имейл:</strong> {{email}}</p>
            <p><strong>Дата:</strong> {{date}}</p>
            <p><strong>Час:</strong> {{time}}</p>
            <p><strong>Бележка:</strong> {{note}}</p>
          </div>
        `.trim(),
      };
    case 'order.created':
      return {
        subject: '\u041d\u043e\u0432\u0430 \u043f\u043e\u0440\u044a\u0447\u043a\u0430',
        html: `
          <div style="font-family:Arial,sans-serif">
            <h2>\u041d\u043e\u0432\u0430 \u043f\u043e\u0440\u044a\u0447\u043a\u0430</h2>
            <p><strong>\u0418\u043c\u0435:</strong> {{name}}</p>
            <p><strong>\u0418\u043c\u0435\u0439\u043b:</strong> {{email}}</p>
            <p><strong>\u0421\u0443\u043c\u0430:</strong> {{amount}}</p>
            <p><strong>\u0412\u0430\u043b\u0443\u0442\u0430:</strong> {{currency}}</p>
            <p><strong>\u041f\u0440\u043e\u0434\u0443\u043a\u0442\u0438 / \u0434\u0435\u0442\u0430\u0439\u043b\u0438:</strong></p>
            <div style="white-space:pre-wrap;border:1px solid #eee;padding:12px;border-radius:8px">{{items}}</div>
          </div>
        `.trim(),
      };
    case 'payment.received':
      return {
        subject: 'Получено плащане',
        html: `
          <div style="font-family:Arial,sans-serif">
            <h2>Получено плащане</h2>
            <p><strong>Сума:</strong> {{amount}}</p>
            <p><strong>Валута:</strong> {{currency}}</p>
            <p><strong>Имейл на клиента:</strong> {{email}}</p>
          </div>
        `.trim(),
      };
    default:
      return { subject: 'Известие', html: `<div>Имате ново известие.</div>` };
  }
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

  const base = templateRow
    ? { subject: templateRow.subject, html: templateRow.htmlBody }
    : defaultTemplate(type);

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


