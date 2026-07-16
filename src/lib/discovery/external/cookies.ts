/**
 * ABeam Workbench — Neutral Process Discovery guest cookie configuration.
 *
 * Mirrors the Affirm guest cookie contract (src/lib/affirm/external/cookies.ts),
 * scoped to the /d surface. Contractual — change requires security review.
 *
 *   Name:     discovery-guest
 *   Path:     /d           (NOT / — Path-scoping blocks consultant-side XSS at
 *                           /workbench etc. from attaching the guest cookie via
 *                           cross-path fetch. It also makes the /a and /d guest
 *                           sessions non-transferable: neither surface's cookie
 *                           is ever sent to the other.)
 *   Domain:   (not set — host-only)
 *   Secure:   true in production, false in local dev
 *   HttpOnly: true
 *   SameSite: Strict
 *   Value:    the RAW guest session token (base64url). We store SHA-256(raw) as
 *             DiscoveryGuestSession.tokenHash and resolve by hash, so the DB
 *             never holds a replayable credential.
 *   Max-Age:  3600 (sliding idle); 28800 absolute cap enforced server-side via
 *             DiscoveryGuestSession.createdAt + 8h.
 *
 * Why this is a parallel file rather than a parameterization of the Affirm one:
 * that file is marked "change requires security review", and threading a
 * name/path argument through it would edit a security-reviewed module for no
 * functional gain. The constants below are the only difference. Deviation
 * logged in BUILD-LOG (D7).
 */

export const DISCOVERY_GUEST_COOKIE_NAME = "discovery-guest";
export const DISCOVERY_GUEST_COOKIE_PATH = "/d";

/** Sliding idle window in seconds. Refreshed on every guest request. */
export const DISCOVERY_GUEST_COOKIE_MAX_AGE_SEC = 3_600;

/** Absolute cap (8 hours). Enforced server-side against createdAt. */
export const DISCOVERY_GUEST_SESSION_ABSOLUTE_MAX_AGE_SEC = 8 * 60 * 60;

export interface DiscoveryGuestCookieAttrs {
  name: string;
  value: string;
  path: string;
  httpOnly: true;
  sameSite: "strict";
  secure: boolean;
  maxAge: number;
}

export function buildDiscoveryGuestCookie(value: string): DiscoveryGuestCookieAttrs {
  return {
    name: DISCOVERY_GUEST_COOKIE_NAME,
    value,
    path: DISCOVERY_GUEST_COOKIE_PATH,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: DISCOVERY_GUEST_COOKIE_MAX_AGE_SEC,
  };
}

export function clearDiscoveryGuestCookie(): DiscoveryGuestCookieAttrs {
  return { ...buildDiscoveryGuestCookie(""), maxAge: 0 };
}
