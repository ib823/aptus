/**
 * Server-side rendered HTML template for the presales signoff PDF.
 *
 * The same HTML is used for:
 *   - the in-browser DRAFT preview (rendered server-side and returned as
 *     HTML; the browser displays it pre-sign);
 *   - the final signed PDF (rendered server-side by /api/presales/sign-pdf
 *     via @sparticuz/chromium and stored in Vercel Blob).
 *
 * Both surfaces call renderSignoffPdfHtml() so the screen preview and the
 * printed artifact match pixel-for-pixel.
 *
 * PRINCIPLED EXCEPTION: the PDF stays cream-colored in BOTH light and dark
 * mode (locked decision). The screen preview matches the printed artifact.
 * Do not apply the dark-mode token swap to this surface.
 */

export interface SignedDecisionRow {
  scopeCode: string;
  decisionId: string;
  /** Display title from the snapshot. */
  decisionTitle: string;
  /** Chosen label: 'Standard' | 'Configure' | 'Custom' | 'No position taken' */
  choiceLabel: string;
  /** Optional stakeholder notes. Always-present string for exactOptionalPropertyTypes compatibility — empty string when absent. */
  notes: string | undefined;
}

export interface SignoffPdfContext {
  clientCompanyName: string;
  bundleReference: string;
  signatoryName: string;
  signatoryEmail: string;
  signedAtIso: string;
  signedWithinGrace: boolean;
  documentHash: string;
  acknowledgementVersion: string;
  pdpaVersion: string;
  /** All decisions grouped by scopeCode in the order they appear. */
  scopes: Array<{
    scopeCode: string;
    scopeTitle: string;
    decisions: SignedDecisionRow[];
  }>;
}

const CREAM_BG = '#FFFCF4';
const NAVY = '#002B5C';
const HAIRLINE = '#E5E5E5';
const TEXT_PRIMARY = '#1A1A1A';
const TEXT_SECONDARY = '#5A5A5A';

export function renderSignoffPdfHtml(ctx: SignoffPdfContext): string {
  const signedLocal = new Date(ctx.signedAtIso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const hashShort = ctx.documentHash.slice(0, 12);

  const scopeBlocks = ctx.scopes
    .map(
      (s) => `
      <section style="margin-bottom:28px">
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${TEXT_SECONDARY}">${escapeHtml(s.scopeCode)}</div>
        <h2 style="margin:4px 0 16px;font-size:18px;font-weight:600;color:${NAVY}">${escapeHtml(s.scopeTitle)}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead>
            <tr style="border-bottom:1px solid ${HAIRLINE}">
              <th align="left" style="padding:6px 4px;font-weight:600;color:${TEXT_SECONDARY};width:60%">Decision</th>
              <th align="left" style="padding:6px 4px;font-weight:600;color:${TEXT_SECONDARY}">Position</th>
            </tr>
          </thead>
          <tbody>
            ${s.decisions
              .map(
                (d) => `
                <tr style="border-bottom:1px solid ${HAIRLINE}">
                  <td style="padding:8px 4px;color:${TEXT_PRIMARY}">
                    ${escapeHtml(d.decisionTitle)}
                    ${d.notes ? `<div style="margin-top:4px;font-size:11px;color:${TEXT_SECONDARY};font-style:italic">"${escapeHtml(d.notes)}"</div>` : ''}
                  </td>
                  <td style="padding:8px 4px;color:${TEXT_PRIMARY};font-weight:600">${escapeHtml(d.choiceLabel)}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Presales signoff · ${escapeHtml(ctx.clientCompanyName)}</title>
  <style>
    @page { size: A4; margin: 24mm 18mm 24mm 18mm; }
    body { margin:0; background:${CREAM_BG}; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color:${TEXT_PRIMARY}; }
    .wrap { max-width: 700px; margin: 0 auto; padding: 24px 0; }
    .brand-bar { background:${NAVY}; color:#FFFFFF; padding: 12px 20px; border-radius: 8px 8px 0 0; font-size: 12px; letter-spacing: 0.06em; }
    .header { background:${CREAM_BG}; padding: 20px 20px 12px; border:1px solid ${HAIRLINE}; border-top:0; border-radius: 0 0 8px 8px; }
    h1 { margin: 0; font-size: 24px; font-weight: 600; color: ${NAVY}; }
    .meta { display:flex; flex-wrap:wrap; gap:16px; margin-top:8px; font-size:11px; color:${TEXT_SECONDARY}; }
    .meta strong { color:${TEXT_PRIMARY}; }
    .signature-card { margin: 24px 0 32px; padding: 16px 20px; background: #FFFFFF; border: 1px solid ${HAIRLINE}; border-radius: 8px; font-size: 12px; }
    .grace { margin-left: 8px; padding: 2px 6px; background:#FAEEDA; color:#633806; border-radius:4px; font-size:10px; vertical-align: middle; }
    footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid ${HAIRLINE}; font-size: 10px; color: ${TEXT_SECONDARY}; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand-bar">ABeam Workbench · Signoff</div>
    <div class="header">
      <h1>${escapeHtml(ctx.clientCompanyName)} — presales decisions</h1>
      <div class="meta">
        <span><strong>Reference</strong> ${escapeHtml(ctx.bundleReference)}</span>
        <span><strong>Signed</strong> ${escapeHtml(signedLocal)} MYT${ctx.signedWithinGrace ? '<span class="grace">within grace</span>' : ''}</span>
        <span><strong>Document hash</strong> ${escapeHtml(hashShort)}</span>
      </div>
    </div>

    <div class="signature-card">
      <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${TEXT_SECONDARY};margin-bottom:6px">Authorized signatory</div>
      <div style="font-size:14px;font-weight:600">${escapeHtml(ctx.signatoryName)}</div>
      <div style="font-size:12px;color:${TEXT_SECONDARY}">${escapeHtml(ctx.signatoryEmail)}</div>
      <div style="margin-top:8px;font-size:11px;color:${TEXT_SECONDARY}">Acknowledgement v${escapeHtml(ctx.acknowledgementVersion)} · PDPA v${escapeHtml(ctx.pdpaVersion)}</div>
    </div>

    ${scopeBlocks}

    <footer>
      Generated by ABeam Workbench. Document hash uniquely identifies this signed artifact (SHA-256, first 12 chars shown).
    </footer>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}
