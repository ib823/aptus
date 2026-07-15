/**
 * ABeam Workbench — Affirm external guest cookie configuration.
 *
 * Mirrors the presales guest cookie contract (src/lib/presales/cookies.ts),
 * scoped to the /a surface. Contractual — change requires security review.
 *
 *   Name:     affirm-guest
 *   Path:     /a           (NOT / — Path-scoping blocks consultant-side XSS at
 *                           /workbench etc. from attaching the guest cookie via
 *                           cross-path fetch; see presales cookies.ts rationale)
 *   Domain:   (not set — host-only)
 *   Secure:   true in production, false in local dev
 *   HttpOnly: true
 *   SameSite: Strict
 *   Value:    the RAW guest session token (base64url). We store SHA-256(raw)
 *             as AffirmGuestSession.tokenHash and resolve by hash — so unlike
 *             presales (raw PK in cookie) the DB never holds a replayable
 *             credential.
 *   Max-Age:  3600 (sliding idle); 28800 absolute cap enforced server-side via
 *             AffirmGuestSession.createdAt + 8h.
 */

export const AFFIRM_GUEST_COOKIE_NAME = "affirm-guest";
export const AFFIRM_GUEST_COOKIE_PATH = "/a";

/** Sliding idle window in seconds. Refreshed on every guest request. */
export const AFFIRM_GUEST_COOKIE_MAX_AGE_SEC = 3_600;

/** Absolute cap (8 hours). Enforced server-side against createdAt. */
export const AFFIRM_GUEST_SESSION_ABSOLUTE_MAX_AGE_SEC = 8 * 60 * 60;

export interface AffirmGuestCookieAttrs {
  name: string;
  value: string;
  path: string;
  httpOnly: true;
  sameSite: "strict";
  secure: boolean;
  maxAge: number;
}

export function buildAffirmGuestCookie(value: string): AffirmGuestCookieAttrs {
  return {
    name: AFFIRM_GUEST_COOKIE_NAME,
    value,
    path: AFFIRM_GUEST_COOKIE_PATH,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: AFFIRM_GUEST_COOKIE_MAX_AGE_SEC,
  };
}

export function clearAffirmGuestCookie(): AffirmGuestCookieAttrs {
  return { ...buildAffirmGuestCookie(""), maxAge: 0 };
}
