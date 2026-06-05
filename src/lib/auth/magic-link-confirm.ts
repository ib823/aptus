/**
 * Magic-link confirm-interstitial helpers.
 *
 * Corporate mail security (e.g. Microsoft Defender for Office 365 "Safe
 * Links") GET-scans — and often "detonates" (renders + follows links and
 * nested URLs) — every link in an incoming email. NextAuth's
 * /api/auth/callback/email is a single-use GET: the FIRST GET consumes the
 * verification token. An interstitial that exposes the callback URL to a GET
 * (either in a ?next= query the scanner already holds, or in an <a href> it
 * can follow) is therefore burned by the scanner before the human clicks —
 * the recipient lands on error=Verification and the sign-in appears to loop
 * back to the login page.
 *
 * Defence: never expose the callback URL to a GET. The email link carries the
 * callback URL ENCRYPTED (AES-256-GCM, authenticated) as ?c=. The confirm
 * page decrypts it server-side and renders a POST form whose only payload is
 * the same opaque ciphertext. Scanners GET the page (harmless) and do not
 * submit POST forms, so only the human's click reaches the callback. The
 * ciphertext is authenticated (GCM tag), so a third party cannot forge one.
 *
 * Keyed off NEXTAUTH_SECRET, which is always present in any environment that
 * can mint magic links — so this needs no extra configuration.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** POST endpoint that turns a sealed token back into the real callback hop. */
export const CONTINUE_PATH = "/presales/login/continue";
const CALLBACK_PATH = "/api/auth/callback/email";

function getKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required to seal magic-link confirm URLs");
  }
  // Derive a stable 32-byte key from the always-present NextAuth secret.
  return createHash("sha256").update(secret).digest();
}

/** Encrypt a callback URL into a URL-safe (base64url) opaque token. */
export function sealCallbackUrl(callbackUrl: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  const enc = Buffer.concat([cipher.update(callbackUrl, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64url");
}

/** Decrypt a sealed token back to the callback URL, or null if invalid/tampered. */
export function openSealedCallbackUrl(sealed: string): string | null {
  try {
    const buf = Buffer.from(sealed, "base64url");
    if (buf.length < IV_LENGTH + 1 + AUTH_TAG_LENGTH) return null;
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(buf.length - AUTH_TAG_LENGTH);
    const ct = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(tag);
    return decipher.update(ct, undefined, "utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}

/**
 * Validate that a (decrypted) URL is a legitimate same-origin NextAuth email
 * callback carrying a token. Defence-in-depth against open redirects on top
 * of the GCM authentication.
 */
export function isValidCallback(rawUrl: string, requestOrigin: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.origin !== requestOrigin) return false;
    if (u.pathname !== CALLBACK_PATH) return false;
    if (!u.searchParams.get("token")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the confirm-interstitial URL embedded in a magic-link email. Prefers
 * the sealed (?c=) form so the callback token is never exposed to a GET
 * scanner; falls back to the legacy plaintext (?next=) form only if sealing
 * throws — keeping sign-in working even on a crypto misconfiguration.
 */
export function buildConfirmUrl(callbackUrl: string, origin: string): string {
  const confirm = new URL("/presales/login/confirm", origin);
  try {
    confirm.searchParams.set("c", sealCallbackUrl(callbackUrl));
  } catch {
    confirm.searchParams.set("next", callbackUrl);
  }
  return confirm.toString();
}
