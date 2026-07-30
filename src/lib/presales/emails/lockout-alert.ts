/**
 * Consultant alert — a guest exhausted their OTP attempts and is locked out.
 *
 * Sent to the bundle's creating consultant (bundle.createdBy), because the
 * lockout cascade in guards.ts revokes the grant permanently and ONLY the
 * consultant can let the guest back in by issuing a fresh invite. A lockout
 * nobody hears about is indistinguishable from a guest who simply left.
 *
 * Mirrors renderAffirmLockoutAlertEmail — same event, sibling surface.
 */

import type { EmailMessage } from './index';

export interface PresalesLockoutAlertContext {
  consultantEmail: string;
  granteeEmail: string;
  /** The bundle's client company, or null when the bundle row is gone. */
  clientCompanyName: string | null;
}

export function renderPresalesLockoutAlertEmail(ctx: PresalesLockoutAlertContext): EmailMessage {
  const where = ctx.clientCompanyName ? ` (${ctx.clientCompanyName})` : '';
  const subject = `Guest access locked${where ? ` — ${ctx.clientCompanyName}` : ''}`;
  const whereHtml = ctx.clientCompanyName
    ? ` to the <strong>${escapeHtml(ctx.clientCompanyName)}</strong> bundle`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1A1A1A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E5E5;border-radius:12px">
        <tr><td style="background:#002B5C;color:#FFFFFF;padding:16px 24px;border-radius:12px 12px 0 0;font-size:14px;letter-spacing:0.04em">ABeam Workbench</td></tr>
        <tr><td style="padding:24px">
          <p style="margin:0 0 14px;font-size:18px;font-weight:600;color:#1A1A1A">A guest's access was locked</p>
          <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#1A1A1A"><strong>${escapeHtml(ctx.granteeEmail)}</strong> entered the wrong verification code five times, so their access${whereHtml} has been permanently locked.</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#5A5A5A">To let them back in, issue a fresh invite from the bundle screen. The old link stays dead.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `A guest's access was locked.`,
    ``,
    `${ctx.granteeEmail} entered the wrong verification code five times, so their access${ctx.clientCompanyName ? ` to the ${ctx.clientCompanyName} bundle` : ''} is permanently locked.`,
    ``,
    `To let them back in, issue a fresh invite from the bundle screen. The old link stays dead.`,
  ].join('\n');

  return { to: ctx.consultantEmail, subject, html, text };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
