/**
 * OTP code email — sent on first redemption from a new device and on
 * /c/verify/resend.
 *
 * Code shown prominently; the wrap is "you requested this code"
 * framing, NOT a magic link. Recipients should never see a clickable
 * URL in this email — the URL belongs in the magic-link template.
 */

import type { EmailMessage } from './index';

export interface OtpContext {
  recipientEmail: string;
  code: string;
  expiresMinutes: number;
}

export function renderOtpEmail(ctx: OtpContext): EmailMessage {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Workbench verification code</title></head>
<body style="margin:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1A1A1A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E5E5;border-radius:12px">
        <tr><td style="background:#002B5C;color:#FFFFFF;padding:16px 24px;border-radius:12px 12px 0 0;font-size:14px;letter-spacing:0.04em">Workbench</td></tr>
        <tr><td style="padding:24px;text-align:center">
          <p style="margin:0 0 12px;font-size:14px;color:#5A5A5A">Your verification code</p>
          <p style="margin:0 0 16px;font-size:32px;letter-spacing:0.4em;font-weight:600;color:#002B5C">${escapeHtml(ctx.code)}</p>
          <p style="margin:0;font-size:13px;color:#5A5A5A">Valid for ${ctx.expiresMinutes} minutes. If you did not request this, you can ignore this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Workbench verification code

Your code: ${ctx.code}

Valid for ${ctx.expiresMinutes} minutes. If you did not request this, you can ignore this email.

— Workbench`;

  return {
    to: ctx.recipientEmail,
    subject: 'Workbench verification code',
    html,
    text,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
