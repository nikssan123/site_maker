export function buildPasswordResetEmail(resetUrl: string): { subject: string; html: string } {
  const subject = 'Смяна на парола в Web Work';

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
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background-color:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <div style="display:inline-block;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#818cf8;">Web Work</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#f1f5f9;line-height:1.3;">Смяна на парола</h1>
                <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#94a3b8;">
                  Получихме заявка за смяна на паролата на твоя акаунт. Натисни бутона по-долу, за да зададеш нова парола. Линкът е валиден 30 минути.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;" align="center">
                <a href="${escapeHtml(resetUrl)}"
                   style="display:inline-block;background:linear-gradient(135deg,#6366f1,#10b981);color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:10px;letter-spacing:0.02em;">
                  Смени паролата
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0 32px;">
                <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:#64748b;">
                  Ако бутонът не работи, копирай този линк в браузъра:
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#818cf8;word-break:break-all;">
                  ${escapeHtml(resetUrl)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
                  Ако не си искал смяна на парола, можеш спокойно да игнорираш този имейл — паролата ти остава непроменена.
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
