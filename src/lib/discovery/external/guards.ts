/**
 * ABeam Workbench — Neutral Process Discovery guest guards.
 *
 * requireGuestSession() is the single entry point every /d/* authenticated
 * surface calls. It is FAIL-CLOSED: returns null (never throws, never leaks why)
 * when
 *   - the feature flag NEUTRAL_DISCOVERY_ENABLED is not "true",
 *   - there is no cookie,
 *   - the session token doesn't resolve, is ended, expired, or idled,
 *   - the grant is revoked or superseded,
 *   - the engagement is no longer client-facing (issued | submitted).
 *
 * Callers redirect a null to the polymorphic terminal page. A non-null result is
 * a fully-resolved { session, grant, engagement } the caller can trust.
 *
 * Mirrors src/lib/affirm/external/guards.ts. guestUaHash/guestIp are reused from
 * there rather than duplicated — they read request headers and have no surface
 * coupling at all.
 */

import { cookies } from "next/headers";
import { guestUaHash } from "@/lib/affirm/external/guards";
import { DISCOVERY_GUEST_COOKIE_NAME } from "./cookies";
import { readGuestSession, type ResolvedDiscoverySession } from "./session";

export { guestIp, guestUaHash } from "@/lib/affirm/external/guards";

/** The master kill-switch. Every /d/* page and route is 404 unless this is on. */
export function isNeutralDiscoveryEnabled(): boolean {
  return process.env.NEUTRAL_DISCOVERY_ENABLED === "true";
}

export interface DiscoveryGuestContext extends ResolvedDiscoverySession {
  uaHash: string;
}

export async function requireGuestSession(now?: Date): Promise<DiscoveryGuestContext | null> {
  if (!isNeutralDiscoveryEnabled()) return null;
  const jar = await cookies();
  const cookieValue = jar.get(DISCOVERY_GUEST_COOKIE_NAME)?.value;
  // Conditional spread: exactOptionalPropertyTypes rejects an explicit undefined.
  const resolved = await readGuestSession({ cookieValue, ...(now ? { now } : {}) });
  if (!resolved) return null;
  return { ...resolved, uaHash: await guestUaHash() };
}

/** Has this device cleared the OTP gate for this grant? */
export function isDeviceVerified(
  grant: { otpVerifiedUaHashes: string[] },
  uaHash: string,
): boolean {
  return grant.otpVerifiedUaHashes.includes(uaHash);
}
