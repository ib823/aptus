/**
 * ABeam Workbench — Presales email dispatcher.
 *
 * Four templates per design system Pass 7:
 *   - magic-link        (initial invitation; the token-bearing URL)
 *   - otp               (6-digit code; first device + resend chain)
 *   - signoff-confirm   (signatory confirmation with PDF attached)
 *   - pdf-delivery      (ABeam internal with PDF attached)
 *
 * Each template ships an HTML body + plain-text alternative. Cross-client
 * targets: Outlook desktop, Gmail web, Apple Mail. Render uses inline
 * styles and table-based layout (Outlook reality), no external CSS.
 *
 * Transport: Resend when RESEND_API_KEY is set, dev-fallback logger
 * otherwise. The fallback prints the recipient + subject + first 200
 * chars of the text body so a local developer can see what would have
 * gone out. The logger never silently drops in production — if
 * NODE_ENV='production' and the key is missing, the dispatch throws so
 * the operator notices before deploying without it.
 *
 * Audit semantics: pdf_emailed audit rows are written by the SENDER for
 * each PDF-bearing send (signoff-confirm + pdf-delivery). magic-link and
 * otp sends are audited at their existing call sites (grant_created /
 * otp_sent).
 */

import { Resend } from 'resend';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
  /** Optional reply-to override (defaults to EMAIL_FROM). */
  replyTo?: string;
}

let resendClient: Resend | null | undefined;
function getResend(): Resend | null {
  if (resendClient !== undefined) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  resendClient = apiKey ? new Resend(apiKey) : null;
  return resendClient;
}

function fromAddress(): string {
  return (
    process.env.PRESALES_EMAIL_FROM ??
    process.env.EMAIL_FROM ??
    'ABeam Workbench <no-reply@abeam.example>'
  );
}

export interface DispatchResult {
  delivered: boolean;
  messageId?: string;
  /** True when a transport error occurred but the caller chose not to throw. */
  bestEffortFailed?: boolean;
}

/**
 * Dispatch with best-effort semantics. Logs (and optionally throws) on
 * failure. The signoff path uses bestEffort=false because email is part of
 * the confirmation contract; the magic-link / otp paths use bestEffort=true
 * because a missed delivery can be re-issued.
 */
export async function dispatchEmail(
  message: EmailMessage,
  opts: { bestEffort?: boolean } = {},
): Promise<DispatchResult> {
  const client = getResend();
  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Resend transport unavailable: RESEND_API_KEY must be set in production',
      );
    }
    // Dev fallback. Print enough to debug; never the attachment contents.
    // eslint-disable-next-line no-console
    console.log(
      `[presales-email:DEV] to=${message.to} subj=${message.subject} text=${message.text.slice(0, 200)}${message.text.length > 200 ? '…' : ''}`,
    );
    return { delivered: false, bestEffortFailed: false };
  }
  try {
    const sendPayload: Parameters<typeof client.emails.send>[0] = {
      from: fromAddress(),
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    };
    if (message.replyTo) sendPayload.replyTo = message.replyTo;
    if (message.attachments && message.attachments.length > 0) {
      sendPayload.attachments = message.attachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString('base64'),
      }));
    }
    const result = await client.emails.send(sendPayload);
    if (result.error) {
      if (opts.bestEffort) {
        console.warn(`[presales-email] send failed (best-effort): ${result.error.message}`);
        return { delivered: false, bestEffortFailed: true };
      }
      throw new Error(`Resend send failed: ${result.error.message}`);
    }
    return { delivered: true, messageId: result.data?.id };
  } catch (err) {
    if (opts.bestEffort) {
      console.warn(`[presales-email] send threw (best-effort):`, err);
      return { delivered: false, bestEffortFailed: true };
    }
    throw err;
  }
}

export { renderMagicLinkEmail } from './magic-link';
export { renderOtpEmail } from './otp';
export { renderSignoffConfirmEmail } from './signoff-confirm';
export { renderPdfDeliveryEmail } from './pdf-delivery';
