/** Login security notification helpers */

import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/brevo";
import { newLoginEmail, sessionDisplacedEmail } from "@/lib/email/templates";

/**
 * Parse a User-Agent string into a readable device description.
 * e.g. "Chrome on Windows", "Safari on macOS", "Firefox on Linux"
 */
export function parseDevice(userAgent: string): string {
  // Browser detection
  let browser = "Unknown browser";
  if (/Edg\//i.test(userAgent)) browser = "Edge";
  else if (/OPR\//i.test(userAgent) || /Opera/i.test(userAgent)) browser = "Opera";
  else if (/Chrome\//i.test(userAgent) && !/Chromium/i.test(userAgent)) browser = "Chrome";
  else if (/Safari\//i.test(userAgent) && !/Chrome/i.test(userAgent)) browser = "Safari";
  else if (/Firefox\//i.test(userAgent)) browser = "Firefox";

  // OS detection
  let os = "Unknown OS";
  if (/Windows/i.test(userAgent)) os = "Windows";
  else if (/Macintosh|Mac OS/i.test(userAgent)) os = "macOS";
  else if (/Linux/i.test(userAgent) && !/Android/i.test(userAgent)) os = "Linux";
  else if (/Android/i.test(userAgent)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(userAgent)) os = "iOS";

  return `${browser} on ${os}`;
}

/**
 * Send a "new sign-in" email if the login is from a different IP or device.
 * Fire-and-forget — does not block the login flow.
 */
export function notifyNewLogin(params: {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  loginMethod: string;
}): void {
  _notifyNewLogin(params).catch((err) => {
    console.error("[LOGIN-NOTIFY] Failed to send new-login email:", err);
  });
}

async function _notifyNewLogin(params: {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  loginMethod: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { email: true, name: true, lastLoginIp: true },
  });
  if (!user) return;

  // Compare against previous login IP and user agent
  const previousIp = user.lastLoginIp;
  const currentIp = params.ipAddress ?? "Unknown";
  const currentUa = params.userAgent ?? "";

  // First login ever — no previous data to compare, skip notification
  if (!previousIp) return;

  // Check if the last revoked session had a different user agent
  const lastRevokedSession = await prisma.session.findFirst({
    where: {
      userId: params.userId,
      isRevoked: true,
      revokedReason: "concurrent_login",
    },
    orderBy: { revokedAt: "desc" },
    select: { userAgent: true, ipAddress: true },
  });

  const previousUa = lastRevokedSession?.userAgent ?? "";
  const previousSessionIp = lastRevokedSession?.ipAddress ?? previousIp;

  // Same IP and same UA → same device, skip notification
  if (currentIp === previousSessionIp && currentUa === previousUa) return;

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const reviewUrl = `${baseUrl}/settings/security`;
  const device = currentUa ? parseDevice(currentUa) : "Unknown device";
  const time = new Date().toUTCString();

  const email = newLoginEmail({
    recipientName: user.name,
    email: user.email,
    loginMethod: params.loginMethod,
    ipAddress: currentIp,
    device,
    time,
    reviewUrl,
  });

  await sendEmail({
    to: { email: user.email, name: user.name },
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
    tags: ["login-notification"],
  });
}

/**
 * Send a "session displaced" email to the user whose session was revoked.
 * Fire-and-forget — does not block the login flow.
 */
export function notifySessionDisplaced(params: {
  userId: string;
  newIpAddress: string | null;
  newUserAgent: string | null;
}): void {
  _notifySessionDisplaced(params).catch((err) => {
    console.error("[LOGIN-NOTIFY] Failed to send session-displaced email:", err);
  });
}

async function _notifySessionDisplaced(params: {
  userId: string;
  newIpAddress: string | null;
  newUserAgent: string | null;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { email: true, name: true },
  });
  if (!user) return;

  const newDevice = params.newUserAgent
    ? parseDevice(params.newUserAgent)
    : "Unknown device";
  const time = new Date().toUTCString();

  const email = sessionDisplacedEmail({
    recipientName: user.name,
    email: user.email,
    newIpAddress: params.newIpAddress ?? "Unknown",
    newDevice,
    time,
  });

  await sendEmail({
    to: { email: user.email, name: user.name },
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
    tags: ["session-displaced"],
  });
}
