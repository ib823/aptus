/** Email templates for all automated notifications */

const BRAND_COLOR = "#000000";
const BRAND_NAME = "aptus";

export function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BRAND_NAME}</title>
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 0 40px;">
              <span style="font-size:24px;font-weight:500;color:${BRAND_COLOR};letter-spacing:-0.02em;">${BRAND_NAME.toLowerCase()}</span>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:24px 40px 40px 40px;">
              ${content}
            </td>
          </tr>
        </table>
        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                ${BRAND_NAME} &mdash; SAP Assessment Platform
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#d1d5db;">
                This is an automated message. Please do not reply directly.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function button(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background:${BRAND_COLOR};border-radius:8px;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:12px 32px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;letter-spacing:0.01em;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

// ── Magic Link ─────────────────────────────────────────────────────────────

export function magicLinkEmail(url: string, email: string): { subject: string; html: string; text: string } {
  return {
    subject: `Sign in to ${BRAND_NAME}`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Sign in to your account</h2>
      <p style="margin:0 0 4px;font-size:14px;color:#6b7280;line-height:1.6;">
        Click the button below to sign in as <strong>${email}</strong>.
      </p>
      <p style="margin:0 0 16px;font-size:13px;color:#9ca3af;">
        This link expires in 15 minutes. If you didn't request this, you can safely ignore this email.
      </p>
      ${button(url, "Sign in to aptus")}
      <p style="margin:0;font-size:12px;color:#d1d5db;word-break:break-all;">
        Or copy this link: ${url}
      </p>
    `),
    text: `Sign in to ${BRAND_NAME}\n\nClick this link to sign in as ${email}:\n${url}\n\nThis link expires in 15 minutes.`,
  };
}

// ── Stakeholder Invitation ─────────────────────────────────────────────────

export function stakeholderInviteEmail(params: {
  recipientName: string;
  inviterName: string;
  assessmentName: string;
  role: string;
  loginUrl: string;
}): { subject: string; html: string; text: string } {
  const roleName = params.role.replace(/_/g, " ");
  return {
    subject: `You've been invited to ${params.assessmentName} on ${BRAND_NAME}`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">You're invited</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${params.recipientName},
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        <strong>${params.inviterName}</strong> has invited you as a <strong>${roleName}</strong>
        to the assessment for <strong>${params.assessmentName}</strong>.
      </p>
      ${button(params.loginUrl, "View Assessment")}
    `),
    text: `Hi ${params.recipientName},\n\n${params.inviterName} has invited you as a ${roleName} to the assessment for ${params.assessmentName}.\n\nSign in: ${params.loginUrl}`,
  };
}

// ── Assessment Status Change ───────────────────────────────────────────────

export function assessmentStatusEmail(params: {
  recipientName: string;
  assessmentName: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  assessmentUrl: string;
}): { subject: string; html: string; text: string } {
  const statusLabel = params.newStatus.replace(/_/g, " ");
  return {
    subject: `${params.assessmentName} — Status updated to ${statusLabel}`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Assessment Status Updated</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${params.recipientName},
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;line-height:1.6;">
        The assessment for <strong>${params.assessmentName}</strong> has been moved from
        <strong>${params.oldStatus.replace(/_/g, " ")}</strong> to
        <strong>${statusLabel}</strong> by ${params.changedBy}.
      </p>
      ${button(params.assessmentUrl, "View Assessment")}
    `),
    text: `Hi ${params.recipientName},\n\nThe assessment for ${params.assessmentName} has been moved from ${params.oldStatus} to ${params.newStatus} by ${params.changedBy}.\n\nView: ${params.assessmentUrl}`,
  };
}

// ── MFA Enabled Confirmation ───────────────────────────────────────────────

export function mfaEnabledEmail(params: {
  recipientName: string;
  email: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `Two-factor authentication enabled on ${BRAND_NAME}`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">MFA Enabled</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${params.recipientName},
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Two-factor authentication has been successfully enabled on your account
        (<strong>${params.email}</strong>). You'll need your authenticator app to sign in.
      </p>
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        If you didn't enable this, please contact your administrator immediately.
      </p>
    `),
    text: `Hi ${params.recipientName},\n\nTwo-factor authentication has been enabled on your account (${params.email}).\n\nIf you didn't enable this, please contact your administrator immediately.`,
  };
}

// ── Gap Resolution Notification ────────────────────────────────────────────

export function gapResolutionEmail(params: {
  recipientName: string;
  assessmentName: string;
  scopeItemName: string;
  gapTitle: string;
  resolution: string;
  resolvedBy: string;
  assessmentUrl: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `Gap resolved: ${params.gapTitle} — ${params.assessmentName}`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Gap Resolution Update</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${params.recipientName},
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;line-height:1.6;">
        A gap in <strong>${params.scopeItemName}</strong> has been resolved:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Gap</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${params.gapTitle}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;font-size:12px;color:#6b7280;font-weight:600;">Resolution</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827;">${params.resolution}</td>
        </tr>
      </table>
      <p style="margin:0 0 16px;font-size:13px;color:#9ca3af;">Resolved by ${params.resolvedBy}</p>
      ${button(params.assessmentUrl, "View Assessment")}
    `),
    text: `Hi ${params.recipientName},\n\nA gap in ${params.scopeItemName} has been resolved.\n\nGap: ${params.gapTitle}\nResolution: ${params.resolution}\nResolved by: ${params.resolvedBy}\n\nView: ${params.assessmentUrl}`,
  };
}

// ── New Login Notification ─────────────────────────────────────────────────

export function newLoginEmail(params: {
  recipientName: string;
  email: string;
  loginMethod: string;
  ipAddress: string;
  device: string;
  time: string;
  reviewUrl: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `New sign-in to your ${BRAND_NAME} account`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">New sign-in to your account</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${params.recipientName},
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Your account (<strong>${params.email}</strong>) was just signed into from a new device or location.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Login method</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${params.loginMethod}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">IP address</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${params.ipAddress}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">Device</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${params.device}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;font-size:12px;color:#6b7280;font-weight:600;">Time</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827;">${params.time}</td>
        </tr>
      </table>
      ${button(params.reviewUrl, "Review account security")}
      <p style="margin:0;font-size:13px;color:#dc2626;font-weight:500;">
        If this wasn't you, secure your account immediately.
      </p>
    `),
    text: `Hi ${params.recipientName},\n\nYour account (${params.email}) was just signed into from a new device or location.\n\nLogin method: ${params.loginMethod}\nIP address: ${params.ipAddress}\nDevice: ${params.device}\nTime: ${params.time}\n\nReview account security: ${params.reviewUrl}\n\nIf this wasn't you, secure your account immediately.`,
  };
}

// ── Session Displaced Notification ────────────────────────────────────────

export function sessionDisplacedEmail(params: {
  recipientName: string;
  email: string;
  newIpAddress: string;
  newDevice: string;
  time: string;
}): { subject: string; html: string; text: string } {
  const reviewUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/settings/security`;
  return {
    subject: `Your ${BRAND_NAME} session was ended`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Your session was ended</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${params.recipientName},
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        You were signed out because your account (<strong>${params.email}</strong>) was accessed from another device.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;font-size:12px;color:#6b7280;font-weight:600;border-bottom:1px solid #e5e7eb;">New login IP</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;">${params.newIpAddress}</td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;font-size:12px;color:#6b7280;font-weight:600;">New login device</td>
          <td style="padding:12px 16px;font-size:14px;color:#111827;">${params.newDevice}</td>
        </tr>
      </table>
      ${button(reviewUrl, "Review account security")}
      <p style="margin:0;font-size:13px;color:#dc2626;font-weight:500;">
        If this wasn't you, secure your account immediately.
      </p>
    `),
    text: `Hi ${params.recipientName},\n\nYou were signed out because your account (${params.email}) was accessed from another device.\n\nNew login IP: ${params.newIpAddress}\nNew login device: ${params.newDevice}\n\nReview account security: ${reviewUrl}\n\nIf this wasn't you, secure your account immediately.`,
  };
}

// ── Report Ready ───────────────────────────────────────────────────────────

export function reportReadyEmail(params: {
  recipientName: string;
  assessmentName: string;
  reportType: string;
  downloadUrl: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: `${params.reportType} ready — ${params.assessmentName}`,
    html: baseLayout(`
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827;">Report Ready</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Hi ${params.recipientName},
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#6b7280;line-height:1.6;">
        Your <strong>${params.reportType}</strong> for <strong>${params.assessmentName}</strong>
        is ready for download.
      </p>
      ${button(params.downloadUrl, "Download Report")}
    `),
    text: `Hi ${params.recipientName},\n\nYour ${params.reportType} for ${params.assessmentName} is ready.\n\nDownload: ${params.downloadUrl}`,
  };
}
