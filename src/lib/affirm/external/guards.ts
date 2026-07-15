/**
 * ABeam Workbench — Affirm external guest guards.
 *
 * requireGuestSession() is the single entry point every /a/* authenticated
 * surface calls. It is FAIL-CLOSED: returns null (never throws, never leaks
 * why) when
 *   - the feature flag AFFIRM_EXTERNAL_ENABLED is not "true",
 *   - there is no cookie,
 *   - the session token doesn't resolve, is ended, expired, or idled,
 *   - the grant is revoked or superseded,
 *   - the bundle is no longer client-facing (issued | submitted).
 *
 * Callers redirect a null to the polymorphic terminal page. A non-null result
 * is a fully-resolved { session, grant, bundle } the caller can trust.
 */

import { cookies, headers } from "next/headers";
import { AFFIRM_GUEST_COOKIE_NAME } from "./cookies";
import { readGuestSession, type ResolvedGuestSession } from "./session";
import { hashUserAgent } from "@/lib/security/ua-fingerprint";

/** The master kill-switch. Every /a/* page and route is 404 unless this is on. */
export function isAffirmExternalEnabled(): boolean {
  return process.env.AFFIRM_EXTERNAL_ENABLED === "true";
}

/** Read the request's UA and return its device hash (for the OTP gate). */
export async function guestUaHash(): Promise<string> {
  const h = await headers();
  return hashUserAgent(h.get("user-agent") ?? "");
}

/** Best-effort client IP from forwarding headers. */
export async function guestIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

export interface GuestContext extends ResolvedGuestSession {
  uaHash: string;
}

/**
 * Resolve the current guest session or null. Also returns whether the current
 * device has cleared OTP (uaHash ∈ grant.otpVerifiedUaHashes) so callers can
 * bounce to /a/verify without a second query.
 */
export async function requireGuestSession(now?: Date): Promise<GuestContext | null> {
  if (!isAffirmExternalEnabled()) return null;
  const jar = await cookies();
  const cookieValue = jar.get(AFFIRM_GUEST_COOKIE_NAME)?.value;
  const resolved = await readGuestSession(now ? { cookieValue, now } : { cookieValue });
  if (!resolved) return null;
  const uaHash = await guestUaHash();
  return { ...resolved, uaHash };
}

/** Whether a given device has already cleared OTP for this grant. */
export function isDeviceVerified(
  grant: { otpVerifiedUaHashes: string[] },
  uaHash: string,
): boolean {
  return grant.otpVerifiedUaHashes.includes(uaHash);
}
