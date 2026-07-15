/**
 * ABeam Workbench — Generic stateless HMAC nonce.
 *
 * Extracted from the presales CSRF pattern (src/lib/presales/csrf.ts) so the
 * Affirm external guest surface can reuse it instead of duplicating. The
 * presales module is left as-is to avoid churn on its test suite.
 *
 * A short-lived nonce is derived via HMAC over a subject string plus a
 * time-bucket window. The form embeds the nonce; the POST handler recomputes
 * the current and prior window's HMAC (sliding boundary tolerance) and accepts
 * if either matches. Used where the double-submit cookie pattern is impossible
 * (idempotent landing GETs that set no cookie) or where uniform CSRF discipline
 * is wanted across a surface's state-changing POSTs.
 *
 * Threat model: a cross-site attacker cannot read the form-rendered nonce and
 * cannot derive it (HMAC secret). SameSite=Strict on the eventual session
 * cookie already blocks the classic cross-origin POST; the nonce additionally
 * defends against same-origin form-injection (XSS) posting on the guest's
 * behalf. Window-boundary tolerance avoids rejecting a user who submits shortly
 * after the window rolls over.
 */

import { createHmac, timingSafeEqual } from "crypto";

/** 10-minute nonce window. */
export const NONCE_WINDOW_SEC = 600;

export interface NonceScheme {
  /** Compute the current-window nonce for a subject. */
  issue(subject: string): string;
  /** Verify a nonce against the current or prior window. */
  verify(subject: string, nonce: string): boolean;
}

/**
 * Build a nonce scheme bound to a purpose label and a secret resolver. The
 * purpose label namespaces the HMAC so nonces from different schemes (e.g.
 * "affirm-redeem-v1" vs "affirm-session-v1") never cross-validate even when
 * they share a secret and subject.
 */
export function createNonceScheme(
  purpose: string,
  getSecret: () => string,
  windowSec: number = NONCE_WINDOW_SEC,
): NonceScheme {
  function currentWindow(now: number = Date.now()): number {
    return Math.floor(now / 1000 / windowSec);
  }

  function sign(subject: string, window: number): string {
    return createHmac("sha256", getSecret())
      .update(`${purpose}:${window}:${subject}`)
      .digest("hex");
  }

  return {
    issue(subject: string): string {
      return sign(subject, currentWindow());
    },
    verify(subject: string, nonce: string): boolean {
      if (!nonce || typeof nonce !== "string") return false;
      const candidate = Buffer.from(nonce, "hex");
      if (candidate.length === 0) return false;
      const window = currentWindow();
      for (const w of [window, window - 1]) {
        const expected = Buffer.from(sign(subject, w), "hex");
        if (expected.length !== candidate.length) continue;
        if (timingSafeEqual(expected, candidate)) return true;
      }
      return false;
    },
  };
}
