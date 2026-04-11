export function buildVerificationEmail(code: string): { subject: string; html: string } {
  const subject = 'Твоят код за потвърждение на AppMaker';

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
                <div style="display:inline-block;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#818cf8;">AppMaker</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;">
                <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:700;color:#f1f5f9;line-height:1.3;">Потвърди имейла си</h1>
                <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#94a3b8;">
                  Използвай кода по-долу, за да завършиш регистрацията си. Кодът е валиден за 15 минути.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px;">
                <div style="background:linear-gradient(135deg,rgba(99,102,241,0.18),rgba(16,185,129,0.12));border:1px solid rgba(99,102,241,0.35);border-radius:10px;padding:24px;text-align:center;">
                  <div style="font-size:13px;color:#94a3b8;margin-bottom:8px;">Код за потвърждение</div>
                  <div style="font-size:34px;font-weight:700;letter-spacing:10px;color:#f1f5f9;font-family:'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace;">${escapeHtml(code)}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8;">
                  Ако не си създавал акаунт в AppMaker, можеш спокойно да игнорираш този имейл.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 32px 32px;border-top:1px solid rgba(255,255,255,0.06);margin-top:16px;">
                <p style="margin:16px 0 0 0;font-size:12px;color:#64748b;">
                  © AppMaker · Автоматично съобщение, моля не отговаряй.
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
