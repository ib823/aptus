/**
 * ABeam Workbench — Stateless CSRF nonce for the redeem POST.
 *
 * The landing GET /c/[token] is idempotent and writes no cookie, so we cannot
 * use the double-submit cookie pattern. We instead derive a short-lived nonce
 * via HMAC over the grant token plus a 10-minute time window. The form
 * embeds the nonce as a hidden field; the POST handler recomputes both the
 * current window's HMAC and the prior window's HMAC (sliding boundary
 * tolerance) and accepts the body if either matches.
 *
 * The HMAC secret is PRESALES_CSRF_SECRET. Falls back to NEXTAUTH_SECRET so
 * dev environments without dedicated config still work. In production the
 * env-check script should refuse to boot without an explicit secret — that
 * lives in scripts/check-production-env.js.
 *
 * Threat model: a CSRF attacker who can submit a cross-site POST does not
 * know the form-rendered nonce, cannot derive it (HMAC), and cannot read
 * the response to the GET (CORS + SameSite=Strict on the eventual session
 * cookie). The window-boundary tolerance ensures a user who opens the
 * landing page near the 10-minute mark is not rejected when they submit
 * 30 seconds later.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const NONCE_WINDOW_SEC = 600; // 10 minutes
const NONCE_PURPOSE = 'presales-redeem-v1';

function getSecret(): string {
  // In production we REQUIRE a dedicated PRESALES_CSRF_SECRET (enforced in
  // scripts/check-production-env.js). NEXTAUTH_SECRET is allowed as a dev-
  // only fallback so local environments keep working without a separate
  // secret. Same string for both nonces by design — they're already keyed
  // by purpose label.
  const dedicated = process.env.PRESALES_CSRF_SECRET;
  if (dedicated && dedicated.length >= 16) return dedicated;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Presales CSRF: PRESALES_CSRF_SECRET must be set (>= 16 chars) in production. NEXTAUTH_SECRET fallback is not permitted.',
    );
  }
  const fallback = process.env.NEXTAUTH_SECRET;
  if (!fallback || fallback.length < 16) {
    throw new Error(
      'Presales CSRF: PRESALES_CSRF_SECRET (or dev fallback NEXTAUTH_SECRET) must be set and >= 16 chars',
    );
  }
  return fallback;
}

function currentWindow(now: number = Date.now()): number {
  return Math.floor(now / 1000 / NONCE_WINDOW_SEC);
}

function sign(token: string, window: number): string {
  return createHmac('sha256', getSecret())
    .update(`${NONCE_PURPOSE}:${window}:${token}`)
    .digest('hex');
}

export function issueRedeemNonce(token: string): string {
  return sign(token, currentWindow());
}

export function verifyRedeemNonce(token: string, nonce: string): boolean {
  if (!nonce || typeof nonce !== 'string') return false;
  const candidate = Buffer.from(nonce, 'hex');
  if (candidate.length === 0) return false;
  const window = currentWindow();
  for (const w of [window, window - 1]) {
    const expected = Buffer.from(sign(token, w), 'hex');
    if (expected.length !== candidate.length) continue;
    if (timingSafeEqual(expected, candidate)) return true;
  }
  return false;
}

// ─── Session-bound nonce ────────────────────────────────────────────────────
//
// Used by state-changing POSTs that run inside a presales-session: decisions,
// verify/resend, end, sign. Same HMAC pattern, keyed on sessionId rather than
// the grant token. SameSite=Strict already prevents the cross-origin classic
// CSRF; the nonce protects against same-origin form-injection (XSS) where the
// attacker would otherwise post arbitrary state on behalf of the logged-in
// guest, and keeps the discipline uniform across all /c POSTs.

const SESSION_NONCE_PURPOSE = 'presales-session-v1';

function signSession(sessionId: string, window: number): string {
  return createHmac('sha256', getSecret())
    .update(`${SESSION_NONCE_PURPOSE}:${window}:${sessionId}`)
    .digest('hex');
}

export function issueSessionNonce(sessionId: string): string {
  return signSession(sessionId, currentWindow());
}

export function verifySessionNonce(sessionId: string, nonce: string): boolean {
  if (!nonce || typeof nonce !== 'string') return false;
  const candidate = Buffer.from(nonce, 'hex');
  if (candidate.length === 0) return false;
  const window = currentWindow();
  for (const w of [window, window - 1]) {
    const expected = Buffer.from(signSession(sessionId, w), 'hex');
    if (expected.length !== candidate.length) continue;
    if (timingSafeEqual(expected, candidate)) return true;
  }
  return false;
}
