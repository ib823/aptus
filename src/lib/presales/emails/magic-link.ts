/**
 * Magic-link invitation email — sent at grant_created.
 *
 * Subject and body follow design-system Pass 7 copy. Inline styles, table
 * layout for Outlook tolerance. The brand-navy header bar and the
 * red CTA button are the only colors used.
 */

import type { EmailMessage } from './index';

export interface MagicLinkContext {
  recipientName: string;
  recipientEmail: string;
  clientCompanyName: string;
  consultantName: string;
  linkUrl: string;
  expiresAtIso: string;
  acknowledgementVersion: string;
}

export function renderMagicLinkEmail(ctx: MagicLinkContext): EmailMessage {
  const expiresLocal = new Date(ctx.expiresAtIso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>ABeam Workbench invitation</title></head>
<body style="margin:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1A1A1A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E5E5;border-radius:12px">
        <tr><td style="background:#002B5C;color:#FFFFFF;padding:16px 24px;border-radius:12px 12px 0 0;font-size:14px;letter-spacing:0.04em">ABeam Workbench</td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#002B5C">You're invited to review the proposal</h1>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#1A1A1A">${escapeHtml(ctx.recipientName)},</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#5A5A5A">${escapeHtml(ctx.consultantName)} has shared an SAP Fit-to-Standard workbench prepared for ${escapeHtml(ctx.clientCompanyName)}. Use the link below to review the proposed decisions and indicate your preferences.</p>
          <p style="margin:24px 0">
            <a href="${escapeAttr(ctx.linkUrl)}" style="background:#C8102E;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block">Open workbench</a>
          </p>
          <p style="margin:24px 0 0;font-size:12px;color:#5A5A5A">This link expires ${escapeHtml(expiresLocal)} MYT. By continuing, you accept acknowledgement version ${escapeHtml(ctx.acknowledgementVersion)}.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `ABeam Workbench — proposal review invitation

${ctx.recipientName},

${ctx.consultantName} has shared an SAP Fit-to-Standard workbench prepared for ${ctx.clientCompanyName}.

Open it here:
${ctx.linkUrl}

This link expires ${expiresLocal} MYT. By continuing, you accept acknowledgement version ${ctx.acknowledgementVersion}.

— ABeam Workbench`;

  return {
    to: ctx.recipientEmail,
    subject: `Your ${ctx.clientCompanyName} presales workbench is ready`,
    html,
    text,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
