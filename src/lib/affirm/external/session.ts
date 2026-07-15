/**
 * ABeam Workbench — Affirm external guest session lifecycle.
 *
 * The `affirm-guest` cookie carries a RAW session token (base64url). We persist
 * SHA-256(raw) as AffirmGuestSession.tokenHash and resolve by hash — the DB
 * never holds a replayable credential (an improvement over the presales
 * raw-PK-in-cookie model).
 *
 * Lifetimes:
 *   Absolute cap:   28800s (8h)   — createdAt + 8h
 *   Idle (sliding): 3600s  (60m)  — lastSeenAt refreshed each request
 *
 * A resolved session is only returned when the whole chain is valid: session
 * not ended / within both windows, grant not revoked / not superseded, bundle
 * still client-facing (issued | submitted). Terminal reasons are recorded on
 * endedReason but callers surface them polymorphically.
 */

import { prisma } from "@/lib/db/prisma";
import type { AffirmAccessGrant, AffirmBundle, AffirmGuestSession } from "@prisma/client";
import {
  AFFIRM_GUEST_SESSION_ABSOLUTE_MAX_AGE_SEC,
  AFFIRM_GUEST_COOKIE_MAX_AGE_SEC,
} from "./cookies";
import { hashToken, mintRawToken } from "./tokens";

export type GuestSessionEndedReason =
  | "expired"
  | "idle"
  | "logout"
  | "ended_by_consultant"
  | "bundle_state_change"
  | "superseded";

export interface ResolvedGuestSession {
  session: AffirmGuestSession;
  grant: AffirmAccessGrant;
  bundle: AffirmBundle;
}

/** A bundle is client-facing (guest may hold a session) only while issued or submitted. */
export function isClientFacingState(state: string): boolean {
  return state === "issued" || state === "submitted";
}

/**
 * Create a fresh session for a device. Returns the row plus the RAW token the
 * caller must set in the cookie (it is never persisted).
 */
export async function createGuestSession(args: {
  grantId: string;
  uaHash: string;
  now?: Date;
}): Promise<{ session: AffirmGuestSession; rawToken: string }> {
  const now = args.now ?? new Date();
  const rawToken = mintRawToken();
  const session = await prisma.affirmGuestSession.create({
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
 * every failure mode (not found, ended, expired, idled, grant revoked/
 * superseded, bundle no longer client-facing) — callers must not distinguish.
 */
export async function readGuestSession(opts: {
  cookieValue: string | undefined;
  now?: Date;
}): Promise<ResolvedGuestSession | null> {
  if (!opts.cookieValue) return null;
  const now = opts.now ?? new Date();

  const session = await prisma.affirmGuestSession.findUnique({
    where: { tokenHash: hashToken(opts.cookieValue) },
    include: { grant: { include: { bundle: true } } },
  });
  if (!session) return null;
  if (session.endedAt !== null) return null;

  const absoluteDeadline = new Date(
    session.createdAt.getTime() + AFFIRM_GUEST_SESSION_ABSOLUTE_MAX_AGE_SEC * 1000,
  );
  if (absoluteDeadline <= now) return null;

  const idleDeadline = new Date(
    session.lastSeenAt.getTime() + AFFIRM_GUEST_COOKIE_MAX_AGE_SEC * 1000,
  );
  if (idleDeadline <= now) return null;

  const grant = session.grant;
  if (grant.revokedAt) return null;
  if (grant.supersededByGrantId) return null;

  const bundle = grant.bundle;
  if (!isClientFacingState(bundle.state)) return null;

  return { session, grant, bundle };
}

/** Best-effort write-behind idle refresh. Callers may fire-and-forget. */
export async function touchGuestSession(
  sessionId: string,
  now: Date = new Date(),
): Promise<void> {
  await prisma.affirmGuestSession.update({
    where: { id: sessionId },
    data: { lastSeenAt: now },
  });
}

export async function endGuestSession(args: {
  sessionId: string;
  reason: GuestSessionEndedReason;
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();
  await prisma.affirmGuestSession.updateMany({
    // updateMany so a double-end (idempotent logout) never throws on a missing row
    where: { id: args.sessionId, endedAt: null },
    data: { endedAt: now, endedReason: args.reason },
  });
}

/**
 * End any still-active sessions for a grant on the same device before minting a
 * fresh one (redeem re-entry). Same-device only so a second browser isn't
 * silently logged out.
 */
export async function endActiveSessionsForDevice(args: {
  grantId: string;
  uaHash: string;
  reason: GuestSessionEndedReason;
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();
  await prisma.affirmGuestSession.updateMany({
    where: { grantId: args.grantId, uaHash: args.uaHash, endedAt: null },
    data: { endedAt: now, endedReason: args.reason },
  });
}
