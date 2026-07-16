/**
 * ABeam Workbench — Neutral Process Discovery guest session lifecycle.
 *
 * Mirrors src/lib/affirm/external/session.ts on the Discovery tables. The
 * `discovery-guest` cookie carries a RAW session token; we persist SHA-256(raw)
 * as DiscoveryGuestSession.tokenHash and resolve by hash, so the DB never holds
 * a replayable credential.
 *
 * Lifetimes:
 *   Absolute cap:   28800s (8h)   — createdAt + 8h
 *   Idle (sliding): 3600s  (60m)  — lastSeenAt refreshed each request
 *
 * A resolved session is only returned when the whole chain is valid: session not
 * ended and within both windows, grant not revoked or superseded, engagement
 * still client-facing (issued | submitted). Terminal reasons are recorded on
 * endedReason but callers surface them polymorphically — never oracling why.
 */

import { prisma } from "@/lib/db/prisma";
import type {
  DiscoveryAccessGrant,
  DiscoveryEngagement,
  DiscoveryGuestSession,
} from "@prisma/client";
import {
  DISCOVERY_GUEST_COOKIE_MAX_AGE_SEC,
  DISCOVERY_GUEST_SESSION_ABSOLUTE_MAX_AGE_SEC,
} from "./cookies";
import { hashToken, mintRawToken } from "@/lib/affirm/external/tokens";

/**
 * Note `engagement_state_change` where Affirm has `bundle_state_change` — the
 * only vocabulary difference.
 */
export type DiscoverySessionEndedReason =
  | "expired"
  | "idle"
  | "logout"
  | "ended_by_consultant"
  | "engagement_state_change"
  | "superseded";

export interface ResolvedDiscoverySession {
  session: DiscoveryGuestSession;
  grant: DiscoveryAccessGrant;
  engagement: DiscoveryEngagement;
}

/** Client-facing (guest may hold a session) only while issued or submitted. */
export function isClientFacingState(state: string): boolean {
  return state === "issued" || state === "submitted";
}

/**
 * Sealed / read-only is DERIVED, never a column: anything past `issued` is
 * read-only. `submitted` still resolves a session (the reviewer can re-read
 * their sealed decisions) but every write must refuse.
 */
export function isSealed(engagement: { state: string }): boolean {
  return engagement.state !== "issued";
}

export async function createGuestSession(args: {
  grantId: string;
  uaHash: string;
  now?: Date;
}): Promise<{ session: DiscoveryGuestSession; rawToken: string }> {
  const now = args.now ?? new Date();
  const rawToken = mintRawToken();
  const session = await prisma.discoveryGuestSession.create({
    data: {
      grantId: args.grantId,
      tokenHash: hashToken(rawToken),
      uaHash: args.uaHash,
      createdAt: now,
      lastSeenAt: now,
    },
  });
  return { session, rawToken };
}

/**
 * Resolve a raw cookie token to a valid session chain, or null. Null covers
 * every failure mode (not found, ended, expired, idled, grant revoked or
 * superseded, engagement no longer client-facing) — callers must not distinguish.
 */
export async function readGuestSession(opts: {
  cookieValue: string | undefined;
  now?: Date;
}): Promise<ResolvedDiscoverySession | null> {
  if (!opts.cookieValue) return null;
  const now = opts.now ?? new Date();

  const session = await prisma.discoveryGuestSession.findUnique({
    where: { tokenHash: hashToken(opts.cookieValue) },
    include: { grant: { include: { engagement: true } } },
  });
  if (!session) return null;
  if (session.endedAt !== null) return null;

  const absoluteDeadline = new Date(
    session.createdAt.getTime() + DISCOVERY_GUEST_SESSION_ABSOLUTE_MAX_AGE_SEC * 1000,
  );
  if (absoluteDeadline <= now) return null;

  const idleDeadline = new Date(
    session.lastSeenAt.getTime() + DISCOVERY_GUEST_COOKIE_MAX_AGE_SEC * 1000,
  );
  if (idleDeadline <= now) return null;

  const grant = session.grant;
  if (grant.revokedAt) return null;
  if (grant.supersededByGrantId) return null;

  const engagement = grant.engagement;
  if (!isClientFacingState(engagement.state)) return null;

  return { session, grant, engagement };
}

/** Best-effort write-behind idle refresh. Callers may fire-and-forget. */
export async function touchGuestSession(sessionId: string, now: Date = new Date()): Promise<void> {
  await prisma.discoveryGuestSession.update({
    where: { id: sessionId },
    data: { lastSeenAt: now },
  });
}

export async function endGuestSession(args: {
  sessionId: string;
  reason: DiscoverySessionEndedReason;
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();
  // updateMany so a double-end (idempotent logout) never throws on a missing row.
  await prisma.discoveryGuestSession.updateMany({
    where: { id: args.sessionId, endedAt: null },
    data: { endedAt: now, endedReason: args.reason },
  });
}

/**
 * End any still-active sessions for a grant on the same device before minting a
 * fresh one (redeem re-entry). Same-device only, so a second browser is not
 * silently logged out.
 */
export async function endActiveSessionsForDevice(args: {
  grantId: string;
  uaHash: string;
  reason: DiscoverySessionEndedReason;
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();
  await prisma.discoveryGuestSession.updateMany({
    where: { grantId: args.grantId, uaHash: args.uaHash, endedAt: null },
    data: { endedAt: now, endedReason: args.reason },
  });
}
