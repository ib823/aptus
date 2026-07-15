/**
 * ABeam Workbench — Affirm external email templates.
 *
 * Reuses the presales transport (dispatchEmail / EmailMessage from
 * @/lib/presales/emails) — a single Brevo-SMTP provider, no second transport.
 * These renderers are pure functions returning { to, subject, html, text }.
 * Table-based layout with inline styles (Outlook-safe), HTML + plain-text
 * alternative, no external CSS, no SAP jargon (executive audience).
 */

import type { EmailMessage } from "@/lib/presales/emails";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NAVY = "#002B5C";
const INK = "#1A1A1A";
const MUTED = "#5A5A5A";

function shell(bodyHtml: string): string {
  return [
    `<div style="background:#F4F1EA;padding:32px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">`,
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E6E1D6;">`,
    `<tr><td style="background:${NAVY};padding:20px 28px;color:#FFFFFF;font-size:15px;font-weight:600;letter-spacing:0.02em;">ABeam Workbench</td></tr>`,
    `<tr><td style="padding:28px;">${bodyHtml}</td></tr>`,
    `<tr><td style="padding:18px 28px;border-top:1px solid #EEE9DE;color:${MUTED};font-size:12px;line-height:1.5;">This is a secure, personal link prepared for you by your ABeam consultant. Please do not forward it.</td></tr>`,
    `</table></td></tr></table></div>`,
  ].join("");
}

// ─── Invite ─────────────────────────────────────────────────────────────────

export interface AffirmInviteContext {
  recipientEmail: string;
  displayName: string;
  roleLabel?: string | null;
  clientLabel: string;
  inviteUrl: string;
}

export function renderAffirmInviteEmail(ctx: AffirmInviteContext): EmailMessage {
  const greetName = escapeHtml(ctx.displayName || "there");
  const subject = "Your input on the way we'll set up your systems";
  const html = shell(
    [
      `<p style="margin:0 0 14px;color:${INK};font-size:20px;font-weight:600;">Hello ${greetName},</p>`,
      `<p style="margin:0 0 14px;color:${INK};font-size:15px;line-height:1.6;">As we prepare ${escapeHtml(
        ctx.clientLabel,
      )} for its new systems, we'd like your perspective on how your business runs today. You'll see how the standard approach works, then tell us where your business differs.</p>`,
      `<p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:1.6;">It takes about 20 minutes. You can stop and come back — your answers are saved as you go. Nothing is committed; this simply shapes the conversation at your workshop.</p>`,
      `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${NAVY};"><a href="${escapeHtml(
        ctx.inviteUrl,
      )}" style="display:inline-block;padding:13px 24px;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;">Begin →</a></td></tr></table>`,
      `<p style="margin:20px 0 0;color:${MUTED};font-size:12px;line-height:1.6;">If the button doesn't work, copy this link into your browser:<br><span style="color:${NAVY};word-break:break-all;">${escapeHtml(
        ctx.inviteUrl,
      )}</span></p>`,
    ].join(""),
  );
  const text = [
    `Hello ${ctx.displayName || "there"},`,
    ``,
    `As we prepare ${ctx.clientLabel} for its new systems, we'd like your perspective on how your business runs today. You'll see how the standard approach works, then tell us where your business differs.`,
    ``,
    `It takes about 20 minutes. Your answers are saved as you go, and nothing is committed — this simply shapes the conversation at your workshop.`,
    ``,
    `Begin: ${ctx.inviteUrl}`,
    ``,
    `This is a secure, personal link. Please do not forward it.`,
  ].join("\n");
  return { to: ctx.recipientEmail, subject, html, text };
}

// ─── OTP ────────────────────────────────────────────────────────────────────

export interface AffirmOtpContext {
  recipientEmail: string;
  displayName: string;
  code: string;
  expiresMinutes: number;
}

export function renderAffirmOtpEmail(ctx: AffirmOtpContext): EmailMessage {
  const subject = `Your access code: ${ctx.code}`;
  const html = shell(
    [
      `<p style="margin:0 0 14px;color:${INK};font-size:20px;font-weight:600;">Your access code</p>`,
      `<p style="margin:0 0 18px;color:${INK};font-size:15px;line-height:1.6;">Enter this code to confirm it's you:</p>`,
      `<div style="margin:0 0 18px;padding:16px 20px;background:#F4F1EA;border-radius:10px;text-align:center;font-size:30px;font-weight:700;letter-spacing:0.32em;color:${NAVY};">${escapeHtml(
        ctx.code,
      )}</div>`,
      `<p style="margin:0;color:${MUTED};font-size:13px;line-height:1.6;">The code expires in ${ctx.expiresMinutes} minutes. If you didn't request it, you can ignore this email.</p>`,
    ].join(""),
  );
  const text = [
    `Your access code is: ${ctx.code}`,
    ``,
    `Enter it to confirm it's you. The code expires in ${ctx.expiresMinutes} minutes.`,
    `If you didn't request it, you can ignore this email.`,
  ].join("\n");
  return { to: ctx.recipientEmail, subject, html, text };
}

// ─── Lockout alert (to the consultant) ───────────────────────────────────────

export interface AffirmLockoutAlertContext {
  consultantEmail: string;
  consultantName?: string | null;
  clientLabel: string;
  granteeEmail: string;
  granteeName: string;
}

export function renderAffirmLockoutAlertEmail(ctx: AffirmLockoutAlertContext): EmailMessage {
  const subject = `Access locked for ${ctx.granteeName} (${ctx.clientLabel})`;
  const html = shell(
    [
      `<p style="margin:0 0 14px;color:${INK};font-size:20px;font-weight:600;">A guest's access was locked</p>`,
      `<p style="margin:0 0 14px;color:${INK};font-size:15px;line-height:1.6;"><strong>${escapeHtml(
        ctx.granteeName,
      )}</strong> (${escapeHtml(
        ctx.granteeEmail,
      )}) entered the wrong verification code five times, so their access to <strong>${escapeHtml(
        ctx.clientLabel,
      )}</strong> has been permanently locked.</p>`,
      `<p style="margin:0;color:${MUTED};font-size:14px;line-height:1.6;">To let them back in, re-issue a fresh invite from the bundle's review screen. The old link stays dead.</p>`,
    ].join(""),
  );
  const text = [
    `A guest's access was locked.`,
    ``,
    `${ctx.granteeName} (${ctx.granteeEmail}) entered the wrong verification code five times, so their access to ${ctx.clientLabel} is permanently locked.`,
    ``,
    `To let them back in, re-issue a fresh invite from the bundle's review screen. The old link stays dead.`,
  ].join("\n");
  return { to: ctx.consultantEmail, subject, html, text };
}
