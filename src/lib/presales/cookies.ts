/**
 * ABeam Workbench — Presales guest cookie configuration.
 *
 * The configuration here is contractual. Change requires explicit security
 * review.
 *
 *   Name:     presales-session
 *   Path:     /c           (NOT /  — see "__Host- considered and rejected" below)
 *   Domain:   (not set — host-only)
 *   Secure:   true in production, false in local dev
 *   HttpOnly: true
 *   SameSite: Strict
 *   Max-Age:  3600 (sliding); 28800 absolute cap enforced via PresalesSession.expiresAt
 *
 * __Host- prefix considered and rejected: __Host-presales-session would force
 * Path=/, which sacrifices the XSS-cross-path protection that the Path=/c
 * scope provides. An attacker landing XSS on /dashboard or /admin and calling
 * fetch('/c/<token>', { credentials: 'include' }) would attach the guest
 * cookie under Path=/. With Path=/c the browser refuses to attach the cookie
 * to /dashboard or /admin contexts, so consultant-side XSS cannot exfiltrate
 * guest credentials via cross-path fetch. We restore the protections __Host-
 * would have given us manually: Secure in prod, no Domain attribute,
 * SameSite=Strict, HttpOnly. Do not change without re-evaluating BOTH the
 * XSS-cross-path threat and the __Host- guarantees.
 */

export const PRESALES_COOKIE_NAME = 'presales-session';
export const PRESALES_COOKIE_PATH = '/c';

/** Sliding idle window in seconds. Refreshed on every guest request. */
export const PRESALES_COOKIE_MAX_AGE_SEC = 3_600;

/** Absolute cap (8 hours). Enforced server-side via PresalesSession.expiresAt. */
export const PRESALES_SESSION_ABSOLUTE_MAX_AGE_SEC = 8 * 60 * 60;

export interface PresalesCookieAttrs {
  name: string;
  value: string;
  path: string;
  httpOnly: true;
  sameSite: 'strict';
  secure: boolean;
  maxAge: number;
}

export function buildPresalesCookie(value: string): PresalesCookieAttrs {
  return {
    name: PRESALES_COOKIE_NAME,
    value,
    path: PRESALES_COOKIE_PATH,
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: PRESALES_COOKIE_MAX_AGE_SEC,
  };
}

export function clearPresalesCookie(): PresalesCookieAttrs {
  return { ...buildPresalesCookie(''), maxAge: 0 };
}
