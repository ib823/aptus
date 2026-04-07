/**
 * Server-side helper to send a magic-link sign-in email outside of NextAuth's
 * client-initiated flow. Used by signup, admin user creation, and invitation
 * acceptance so the user receives a working sign-in link the moment their
 * account is created.
 *
 * Token format matches NextAuth's EmailProvider exactly:
 *   - raw token: 32 random bytes hex (64 chars)
 *   - stored token: sha256(`${rawToken}${NEXTAUTH_SECRET}`)
 *   - URL: `${NEXTAUTH_URL}/api/auth/callback/email?token=${rawToken}&email=${email}&callbackUrl=${callbackUrl}`
 *
 * The /api/auth/callback/email handler (provided by NextAuth) re-hashes and
 * looks up the VerificationToken row, so this stays compatible without
 * patching any NextAuth internals.
 */

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/brevo";
import { magicLinkEmail } from "@/lib/email/templates";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours, matches NextAuth default

export async function sendMagicLink(
  email: string,
  callbackUrl: string = "/api/auth/bridge?callbackUrl=/assessments",
): Promise<{ sent: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();

  const secret = process.env.NEXTAUTH_SECRET;
  const baseUrl = process.env.NEXTAUTH_URL;
  if (!secret || !baseUrl) {
    console.error("[sendMagicLink] NEXTAUTH_SECRET or NEXTAUTH_URL not set");
    return { sent: false };
  }

  const rawToken = randomBytes(32).toString("hex");
  const hashedToken = createHash("sha256").update(`${rawToken}${secret}`).digest("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.verificationToken.create({
    data: {
      identifier: normalizedEmail,
      token: hashedToken,
      expires,
    },
  });

  const url = new URL(`${baseUrl}/api/auth/callback/email`);
  url.searchParams.set("token", rawToken);
  url.searchParams.set("email", normalizedEmail);
  url.searchParams.set("callbackUrl", callbackUrl);

  if (!process.env.SMTP_USER) {
    if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
      console.warn(`\n[MAGIC LINK] For ${normalizedEmail}:\n${url.toString()}\n`);
      return { sent: true };
    }
    console.error(`[sendMagicLink] SMTP_USER not configured — cannot send link to ${normalizedEmail}`);
    return { sent: false };
  }

  try {
    const template = magicLinkEmail(url.toString(), normalizedEmail);
    await sendEmail({
      to: { email: normalizedEmail },
      subject: template.subject,
      htmlContent: template.html,
      textContent: template.text,
      tags: ["magic-link", "auth"],
    });
    return { sent: true };
  } catch (err) {
    console.error("[sendMagicLink] Failed to send magic link email:", err);
    return { sent: false };
  }
}
