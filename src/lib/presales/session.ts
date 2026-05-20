/**
 * ABeam Workbench — Presales session lifecycle.
 *
 * The presales-session cookie carries the raw PresalesSession.id (cuid).
 * Lookup is by PK. We don't hash it because (a) the id is opaque, (b) it's
 * created server-side per redemption and only ever lives in the cookie +
 * the DB, (c) the cookie has SameSite=Strict + HttpOnly + Path=/c so
 * exposure surface is minimal. If a future audit decides we want
 * hash-on-store like the consultant Session model, we can rotate via
 * `crypto.createHash('sha256')` here and a migration on PresalesSession.
 *
 * Lifetimes (locked decision Q12):
 *   Absolute cap:   28800s  (8 hours)  — issuedAt + 8h written to row at create
 *   Idle (sliding): 3600s   (60 min)   — lastActivityAt refreshed each request
 */

import { prisma } from '@/lib/db/prisma';
import { randomBytes } from 'crypto';
import {
  PRESALES_COOKIE_MAX_AGE_SEC,
  PRESALES_COOKIE_NAME,
  PRESALES_SESSION_ABSOLUTE_MAX_AGE_SEC,
} from './cookies';
import type { PresalesAccessGrant, PresalesBundle, PresalesSession } from '@prisma/client';

export interface ResolvedPresalesSession {
  session: PresalesSession;
  grant: PresalesAccessGrant;
  bundle: PresalesBundle;
}

export async function createPresalesSession(args: {
  grantId: string;
  bundleId: string;
  ip: string;
  userAgent: string;
  now?: Date;
}): Promise<PresalesSession> {
  const now = args.now ?? new Date();
  const expiresAt = new Date(now.getTime() + PRESALES_SESSION_ABSOLUTE_MAX_AGE_SEC * 1000);
  return prisma.presalesSession.create({
    data: {
      id: randomBytes(24).toString('hex'),
      grantId: args.grantId,
      bundleId: args.bundleId,
      ipAtIssuance: args.ip,
      userAgentAtIssuance: args.userAgent,
      issuedAt: now,
      expiresAt,
      lastActivityAt: now,
      idleTimeoutSec: PRESALES_COOKIE_MAX_AGE_SEC,
    },
  });
}

export async function readPresalesSession(opts: {
  cookieValue: string | undefined;
  now?: Date;
}): Promise<ResolvedPresalesSession | null> {
  if (!opts.cookieValue) return null;
  const now = opts.now ?? new Date();

  const session = await prisma.presalesSession.findUnique({
    where: { id: opts.cookieValue },
    include: { grant: true, bundle: true },
  });
  if (!session) return null;
  if (session.endedAt !== null) return null;
  if (session.expiresAt <= now) return null;

  const idleDeadline = new Date(session.lastActivityAt.getTime() + session.idleTimeoutSec * 1000);
  if (idleDeadline <= now) return null;

  if (session.grant.revokedAt) return null;
  if (session.bundle.revokedAt) return null;
  if (session.bundle.expiresAt <= now) return null;

  return { session, grant: session.grant, bundle: session.bundle };
}

/** Best-effort write-behind activity refresh. Callers may fire-and-forget. */
export async function touchPresalesSession(sessionId: string, now: Date = new Date()): Promise<void> {
  await prisma.presalesSession.update({
    where: { id: sessionId },
    data: { lastActivityAt: now },
  });
}

export async function endPresalesSession(args: {
  sessionId: string;
  reason: 'logout' | 'idle' | 'absolute' | 'revoked' | 'reissued';
  now?: Date;
}): Promise<void> {
  const now = args.now ?? new Date();
  await prisma.presalesSession.update({
    where: { id: args.sessionId },
    data: { endedAt: now, endedReason: args.reason },
  });
}

export const PRESALES_SESSION_COOKIE_NAME = PRESALES_COOKIE_NAME;
