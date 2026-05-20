/**
 * PDF delivery to ABeam internal — sent to the bundle creator after a
 * successful POST /c/sign. Same attachment as the signatory's copy.
 */

import type { EmailMessage } from './index';

export interface PdfDeliveryContext {
  consultantEmail: string;
  consultantName: string;
  clientCompanyName: string;
  signatoryName: string;
  signatoryEmail: string;
  signedAtIso: string;
  documentHashShort: string;
  bundleReference: string;
  pdf: Buffer;
}

export function renderPdfDeliveryEmail(ctx: PdfDeliveryContext): EmailMessage {
  const signedLocal = new Date(ctx.signedAtIso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Presales bundle signed — ${escapeHtml(ctx.clientCompanyName)}</title></head>
<body style="margin:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#1A1A1A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#FFFFFF;border:1px solid #E5E5E5;border-radius:12px">
        <tr><td style="background:#002B5C;color:#FFFFFF;padding:16px 24px;border-radius:12px 12px 0 0;font-size:14px;letter-spacing:0.04em">Workbench · Bundle signed</td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#002B5C">${escapeHtml(ctx.clientCompanyName)} signed off</h1>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#5A5A5A">${escapeHtml(ctx.signatoryName)} (${escapeHtml(ctx.signatoryEmail)}) accepted the workbench. Signed PDF attached.</p>
          <table role="presentation" width="100%" cellpadding="8" cellspacing="0" border="0" style="margin:16px 0;background:#F1EFE8;border-radius:8px;font-size:13px">
            <tr><td style="color:#5A5A5A">Signed at</td><td style="color:#1A1A1A">${escapeHtml(signedLocal)} MYT</td></tr>
            <tr><td style="color:#5A5A5A">Reference</td><td style="color:#1A1A1A">${escapeHtml(ctx.bundleReference)}</td></tr>
            <tr><td style="color:#5A5A5A">Document hash</td><td style="color:#1A1A1A;font-family:Consolas,monospace">${escapeHtml(ctx.documentHashShort)}</td></tr>
          </table>
          <p style="margin:16px 0 0;font-size:13px;color:#5A5A5A">Open the consultant dashboard to access the full audit log and trigger the post-signoff workflow.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Presales bundle signed — ${ctx.clientCompanyName}

${ctx.consultantName},

${ctx.signatoryName} (${ctx.signatoryEmail}) accepted the workbench.

  Signed at:      ${signedLocal} MYT
  Reference:      ${ctx.bundleReference}
  Document hash:  ${ctx.documentHashShort}

Signed PDF attached. Open the consultant dashboard for the full audit log.

— Workbench`;

  return {
    to: ctx.consultantEmail,
    subject: `Signed: ${ctx.clientCompanyName} presales workbench`,
    html,
    text,
    attachments: [
      {
        filename: `${ctx.clientCompanyName.replace(/[^a-zA-Z0-9_-]+/g, '_')}-presales-signoff.pdf`,
        content: ctx.pdf,
        contentType: 'application/pdf',
      },
    ],
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
