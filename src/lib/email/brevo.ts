/** Transactional email via Brevo SMTP (nodemailer transport) */

import nodemailer from "nodemailer";

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp-relay.brevo.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false, // STARTTLS on port 587
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
  });
}

const DEFAULT_FROM = `"${process.env.EMAIL_SENDER_NAME ?? "Aptus"}" <${process.env.EMAIL_FROM ?? "no-reply@brevo.com"}>`;

interface EmailRecipient {
  email: string;
  name?: string;
}

interface SendEmailOptions {
  to: EmailRecipient | EmailRecipient[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  replyTo?: { email: string; name: string };
  tags?: string[];
}

/**
 * Send a transactional email via Brevo SMTP.
 * Supports single or multiple recipients.
 * Free tier: 300 emails/day.
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ messageId: string }> {
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  if (recipients.length === 0) {
    throw new Error("At least one recipient is required");
  }

  // In development without SMTP credentials, log instead of sending
  if (!process.env.SMTP_USER) {
    console.log(`[EMAIL] Would send to: ${recipients.map(r => r.email).join(", ")}`);
    console.log(`[EMAIL] Subject: ${options.subject}`);
    if (process.env.NODE_ENV === "development") {
      console.log(`[EMAIL] Content preview: ${options.htmlContent.substring(0, 200)}...`);
    }
    return { messageId: `dev-${Date.now()}` };
  }

  const transport = getTransport();

  const toList = recipients.map(r => (r.name ? `"${r.name}" <${r.email}>` : r.email)).join(", ");

  const info = await transport.sendMail({
    from: DEFAULT_FROM,
    to: toList,
    subject: options.subject,
    html: options.htmlContent,
    text: options.textContent,
    replyTo: options.replyTo ? `"${options.replyTo.name}" <${options.replyTo.email}>` : undefined,
    headers: options.tags ? { "X-Mailin-Tag": options.tags.join(",") } : undefined,
  });

  return { messageId: info.messageId ?? `smtp-${Date.now()}` };
}

/**
 * Send an email to multiple recipients (batch).
 * Each recipient gets their own copy (not CC/BCC).
 */
export async function sendEmailToMany(
  recipients: EmailRecipient[],
  options: Omit<SendEmailOptions, "to">,
): Promise<{ sent: number; failed: string[] }> {
  const failed: string[] = [];
  let sent = 0;

  // Send in batches of 50
  const batchSize = 50;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    try {
      await sendEmail({
        ...options,
        to: batch,
      });
      sent += batch.length;
    } catch (error) {
      console.error(`[EMAIL] Failed to send batch starting at index ${i}:`, error);
      failed.push(...batch.map(r => r.email));
    }
  }

  return { sent, failed };
}
