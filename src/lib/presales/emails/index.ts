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
 * Transport: Brevo SMTP via nodemailer (the same transport NextAuth
 * magic-link auth uses elsewhere in the codebase). We do NOT introduce a
 * second transport (originally specced as Resend, dropped to keep email
 * infrastructure to a single provider). Dev fallback (no SMTP_USER) logs
 * to console; production with missing creds will fail at sendEmail.
 *
 * Audit semantics: pdf_emailed audit rows are written by the SENDER for
 * each PDF-bearing send (signoff-confirm + pdf-delivery). magic-link and
 * otp sends are audited at their existing call sites (grant_created /
 * otp_sent).
 */

import nodemailer from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
  /** Optional reply-to override (defaults to EMAIL_FROM). */
  replyTo?: string;
}

function fromAddress(): string {
  const from = process.env.PRESALES_EMAIL_FROM ?? process.env.EMAIL_FROM;
  if (from) {
    // If the env var is already a full mailbox (Name <addr>), use as-is.
    if (from.includes('<')) return from;
    const senderName = process.env.EMAIL_SENDER_NAME ?? 'Workbench';
    return `"${senderName}" <${from}>`;
  }
  return '"Workbench" <no-reply@example.com>';
}

function smtpAvailable(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport(): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp-relay.brevo.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false, // STARTTLS on 587
    auth: {
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
  });
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
  if (!smtpAvailable()) {
    if (process.env.NODE_ENV === 'production') {
      const err = new Error(
        'SMTP transport unavailable: SMTP_USER + SMTP_PASS must be set in production',
      );
      if (opts.bestEffort) {
        console.warn('[presales-email] best-effort send skipped:', err.message);
        return { delivered: false, bestEffortFailed: true };
      }
      throw err;
    }
    // Dev fallback. Print enough to debug; never the attachment contents.
    // eslint-disable-next-line no-console
    console.log(
      `[presales-email:DEV] to=${message.to} subj=${message.subject} text=${message.text.slice(0, 200)}${message.text.length > 200 ? '…' : ''}`,
    );
    return { delivered: false, bestEffortFailed: false };
  }

  try {
    const transport = getTransport();
    const sendPayload: nodemailer.SendMailOptions = {
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
        content: a.content,
        contentType: a.contentType ?? 'application/octet-stream',
      }));
    }
    const info = await transport.sendMail(sendPayload);
    return { delivered: true, messageId: info.messageId ?? `smtp-${Date.now()}` };
  } catch (err) {
    if (opts.bestEffort) {
      console.warn('[presales-email] send threw (best-effort):', err);
      return { delivered: false, bestEffortFailed: true };
    }
    throw err;
  }
}

export { renderMagicLinkEmail } from './magic-link';
export { renderOtpEmail } from './otp';
export { renderSignoffConfirmEmail } from './signoff-confirm';
export { renderPdfDeliveryEmail } from './pdf-delivery';
