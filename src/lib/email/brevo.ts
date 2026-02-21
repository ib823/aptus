/** Brevo (formerly Sendinblue) transactional email service */

import { BrevoClient } from "@getbrevo/brevo";

function getClient(): BrevoClient {
  return new BrevoClient({
    apiKey: process.env.BREVO_API_KEY ?? "",
  });
}

// Brevo free tier provides a default sender
const DEFAULT_SENDER = {
  name: process.env.EMAIL_SENDER_NAME ?? "Aptus",
  email: process.env.EMAIL_FROM ?? "no-reply@brevo.com",
};

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
 * Send a transactional email via Brevo.
 * Supports single or multiple recipients.
 * Free tier: 300 emails/day.
 */
export async function sendEmail(options: SendEmailOptions): Promise<{ messageId: string }> {
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  if (recipients.length === 0) {
    throw new Error("At least one recipient is required");
  }

  // In development without API key, log instead of sending
  if (!process.env.BREVO_API_KEY) {
    console.log(`[EMAIL] Would send to: ${recipients.map(r => r.email).join(", ")}`);
    console.log(`[EMAIL] Subject: ${options.subject}`);
    if (process.env.NODE_ENV === "development") {
      console.log(`[EMAIL] Content preview: ${options.htmlContent.substring(0, 200)}...`);
    }
    return { messageId: `dev-${Date.now()}` };
  }

  const client = getClient();

  const request: Parameters<typeof client.transactionalEmails.sendTransacEmail>[0] = {
    sender: DEFAULT_SENDER,
    to: recipients.map(r => ({ email: r.email, name: r.name ?? r.email })),
    subject: options.subject,
    htmlContent: options.htmlContent,
  };
  if (options.textContent) request.textContent = options.textContent;
  if (options.replyTo) request.replyTo = options.replyTo;
  if (options.tags) request.tags = options.tags;

  const result = await client.transactionalEmails.sendTransacEmail(request);

  return { messageId: result.messageId ?? `brevo-${Date.now()}` };
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

  // Brevo supports up to 2000 recipients per API call
  // For safety, batch in groups of 50
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
