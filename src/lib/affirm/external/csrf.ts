/**
 * ABeam Workbench — Affirm external CSRF nonces.
 *
 * Thin wrappers over the shared HMAC nonce factory (src/lib/security/
 * hmac-nonce.ts). Two nonce families, mirroring the presales split:
 *
 *   - redeem nonce: keyed on the grant's raw token, embedded in the
 *     idempotent landing GET's form (which sets no cookie, so double-submit
 *     is impossible).
 *   - session nonce: keyed on the guest session id, for in-session
 *     state-changing POSTs (answers, submit, end).
 *
 * Secret: reuses PRESALES_CSRF_SECRET (the existing dedicated HMAC secret),
 * with a dev-only NEXTAUTH_SECRET fallback. No new env var. Production
 * enforcement lives in scripts/check-production-env.js (presales already
 * requires PRESALES_CSRF_SECRET there).
 */

import { createNonceScheme } from "@/lib/security/hmac-nonce";

function getSecret(): string {
  const dedicated = process.env.PRESALES_CSRF_SECRET;
  if (dedicated && dedicated.length >= 16) return dedicated;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Affirm external CSRF: PRESALES_CSRF_SECRET must be set (>= 16 chars) in production.",
    );
  }
  const fallback = process.env.NEXTAUTH_SECRET;
  if (!fallback || fallback.length < 16) {
    throw new Error(
      "Affirm external CSRF: PRESALES_CSRF_SECRET (or dev fallback NEXTAUTH_SECRET) must be set and >= 16 chars",
    );
  }
  return fallback;
}

const redeemScheme = createNonceScheme("affirm-redeem-v1", getSecret);
const sessionScheme = createNonceScheme("affirm-session-v1", getSecret);

export function issueRedeemNonce(token: string): string {
  return redeemScheme.issue(token);
}

export function verifyRedeemNonce(token: string, nonce: string): boolean {
  return redeemScheme.verify(token, nonce);
}

export function issueSessionNonce(sessionId: string): string {
  return sessionScheme.issue(sessionId);
}

export function verifySessionNonce(sessionId: string, nonce: string): boolean {
  return sessionScheme.verify(sessionId, nonce);
}
