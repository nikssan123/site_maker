export interface InvoiceLineItem {
  description: string;
  /** Total in the smallest currency unit (cents). */
  amountCents: number;
  /** ISO 4217 lowercased ("eur"). */
  currency: string;
}

export interface InvoiceEmailParams {
  /** Optional human-readable invoice number (e.g. "INV-001"). */
  invoiceNumber: string | null;
  /** Date of payment in ISO format. */
  paidAt: Date;
  /** Total in cents. */
  totalCents: number;
  currency: string;
  lineItems: InvoiceLineItem[];
  /** Stripe-hosted invoice URL. */
  hostedInvoiceUrl: string | null;
  /** Direct PDF download (Stripe-hosted). */
  invoicePdfUrl: string | null;
}

function formatMoney(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2);
  const code = currency.toUpperCase();
  if (code === 'EUR') return `${amount} €`;
  return `${amount} ${code}`;
}

function formatDate(d: Date): string {
  try {
    return d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildInvoiceEmail(params: InvoiceEmailParams): { subject: string; html: string } {
  const numberPart = params.invoiceNumber ? ` ${escapeHtml(params.invoiceNumber)}` : '';
  const subject = `Фактура${numberPart} — Web Work`;
  const totalLabel = formatMoney(params.totalCents, params.currency);
  const dateLabel = formatDate(params.paidAt);

  const lineItemsHtml = params.lineItems
    .map(
      (item) => `
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px;color:#e2e8f0;">${escapeHtml(item.description)}</td>
              <td align="right" style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:14px;color:#f1f5f9;font-weight:600;white-space:nowrap;">${escapeHtml(formatMoney(item.amountCents, item.currency))}</td>
            </tr>`,
    )
    .join('');

  const buttonsHtml = (() => {
    const btns: string[] = [];
    if (params.hostedInvoiceUrl) {
      btns.push(`<a href="${escapeHtml(params.hostedInvoiceUrl)}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;margin:0 6px 8px 0;">Виж фактурата</a>`);
    }
    if (params.invoicePdfUrl) {
      btns.push(`<a href="${escapeHtml(params.invoicePdfUrl)}" style="display:inline-block;background:rgba(255,255,255,0.06);color:#e2e8f0;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);margin:0 6px 8px 0;">Изтегли PDF</a>`);
    }
    return btns.join('');
  })();

  const html = `<!DOCTYPE html>
<html lang="bg">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0f0f0f;font-family:'Inter','Segoe UI',Roboto,Arial,sans-serif;color:#f1f5f9;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#0f0f0f;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background-color:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <div style="display:inline-block;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#818cf8;">Web Work</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h1 style="margin:0 0 6px 0;font-size:22px;font-weight:700;color:#f1f5f9;line-height:1.3;">Благодарим ти за плащането</h1>
                <p style="margin:0 0 22px 0;font-size:14px;line-height:1.6;color:#94a3b8;">
                  Получихме плащането ти на ${escapeHtml(dateLabel)}. По-долу е разписката за фактурата${numberPart}.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <div style="background:linear-gradient(135deg,rgba(99,102,241,0.16),rgba(16,185,129,0.10));border:1px solid rgba(99,102,241,0.3);border-radius:10px;padding:18px 22px;">
                  <div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;margin-bottom:6px;">Обща сума</div>
                  <div style="font-size:30px;font-weight:800;color:#f1f5f9;line-height:1.1;">${escapeHtml(totalLabel)}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 0 32px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <thead>
                    <tr>
                      <th align="left" style="padding:8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.1);">Описание</th>
                      <th align="right" style="padding:8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.1);">Сума</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lineItemsHtml || `<tr><td colspan="2" style="padding:12px 0;font-size:13px;color:#94a3b8;">—</td></tr>`}
                  </tbody>
                </table>
              </td>
            </tr>
            ${
              buttonsHtml
                ? `
            <tr>
              <td style="padding:24px 32px 8px 32px;">${buttonsHtml}</td>
            </tr>`
                : ''
            }
            <tr>
              <td style="padding:16px 32px 8px 32px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
                  Можеш да преглеждаш всички свои фактури и абонаменти от <strong style="color:#e2e8f0;">Настройки → Плащания</strong> в Web Work.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px 32px;border-top:1px solid rgba(255,255,255,0.06);margin-top:16px;">
                <p style="margin:16px 0 0 0;font-size:12px;color:#64748b;">
                  © Web Work · Автоматично съобщение, моля не отговаряй.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}
