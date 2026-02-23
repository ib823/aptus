import { baseLayout, button } from "@/lib/email/templates";

/**
 * Generate a notification email from a title, body, and optional deep link.
 */
export function notificationEmail(
  title: string,
  body: string,
  deepLink: string | undefined,
  recipientName: string,
): { subject: string; html: string; text: string } {
  const actionButton = deepLink ? button(deepLink, "View Details") : "";

  return {
    subject: title,
    html: baseLayout(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">${escapeHtml(title)}</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${escapeHtml(recipientName)},
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        ${escapeHtml(body)}
      </p>
      ${actionButton}
    `),
    text: `Hi ${recipientName},\n\n${body}${deepLink ? `\n\nView details: ${deepLink}` : ""}`,
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
