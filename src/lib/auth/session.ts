/** Session management utilities */

import { cache } from "react";
import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { APP_CONFIG } from "@/constants/config";
import type { SessionUser } from "@/types/assessment";
import { mapLegacyRole } from "@/lib/auth/role-migration";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "abeam-session";

/**
 * Generate a cryptographically secure session token.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hash a session token for database storage / lookup. SHA-256 is sufficient
 * here — the token is high-entropy (32 random bytes), so we don't need a
 * KDF; we just want to ensure DB reads don't yield usable tokens.
 */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a new session for a user, revoking whatever exceeds the
 * organization's concurrent-session limit.
 *
 * THE LIMIT IS THE ORGANIZATION'S SETTING, NOT A HARDCODED 1. The org form has
 * offered `maxConcurrentSessions` (1–10, default 3) since it shipped, and this
 * function ignored it — every login revoked every other session, so the
 * setting was a lie on the settings screen. An org-less user keeps the old
 * single-session behavior: with no organization there is no setting to honor,
 * and the strictest reading is the safe one.
 *
 * Returns the raw token (caller sets it in the cookie) and whether an
 * existing session was displaced.
 */
export async function createSession(
  userId: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<{ token: string; hadExistingSession: boolean }> {
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { organization: { select: { maxConcurrentSessions: true } } },
  });
  const maxSessions = Math.max(1, owner?.organization?.maxConcurrentSessions ?? 1);

  // Keep the newest (max - 1) live sessions beside the one being minted;
  // displace the rest, oldest first.
  const active = await prisma.session.findMany({
    where: { userId, isRevoked: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const displaceIds = active.slice(Math.max(0, maxSessions - 1)).map((s) => s.id);
  const revoked =
    displaceIds.length > 0
      ? await prisma.session.updateMany({
          where: { id: { in: displaceIds } },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: "concurrent_login",
          },
        })
      : { count: 0 };

  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(
    Date.now() + APP_CONFIG.sessionMaxAgeHours * 60 * 60 * 1000,
  );

  await prisma.$transaction([
    prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipAddress,
        userAgent,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
        loginCount: { increment: 1 },
      },
    }),
  ]);

  return { token, hadExistingSession: revoked.count > 0 };
}

/** One row of `sessionLookup`: the session, its user, and what validation needs of the organization. */
interface SessionLookupRow {
  id: string;
  isRevoked: boolean;
  expiresAt: Date;
  lastActiveAt: Date | null;
  mfaVerified: boolean;
  passkeyAssertedAt: Date | null;
  userId: string;
  email: string;
  name: string;
  image: string | null;
  role: string;
  organizationId: string | null;
  mfaEnabled: boolean;
  isActive: boolean;
  /** Null when the user has no organization. */
  organizationMfaPolicy: string | null;
  hasWebAuthn: boolean;
}

/**
 * THE SESSION LOOKUP, ONE STATEMENT (P0.14b review round 4, P0.19's budget).
 *
 * It was a nested Prisma `select` (session → user → organization, and the
 * user's passkey count), which Prisma, without the `relationJoins` preview,
 * sends as THREE statements — every signed-in request paid them, and a
 * Workbench console read, which validated its session twice, sent six before
 * its own three. This is the same read joined: the same rows, the same
 * columns. `Session.userId` is a required foreign key, so the inner join is
 * the required relation; the organization is optional, so its join is left.
 * Only whether a passkey exists is read, as `_count > 0` was used.
 *
 * By the token's hash, the only lookup of a session by credential; the
 * Session and User tables are not tenant-anchored (lib/db/tenant-guard.ts).
 * tests/integration/session-lookup.test.ts holds it to the Prisma select it
 * replaces, row for row.
 */
export function sessionLookup(tokenHash: string): Prisma.Sql {
  return Prisma.sql`/* auth:session-lookup */
    SELECT s."id", s."isRevoked", s."expiresAt", s."lastActiveAt", s."mfaVerified", s."passkeyAssertedAt",
      u."id" AS "userId", u."email", u."name", u."image", u."role", u."organizationId", u."mfaEnabled", u."isActive",
      o."mfaPolicy" AS "organizationMfaPolicy",
      EXISTS (SELECT 1 FROM "WebAuthnCredential" w WHERE w."userId" = u."id") AS "hasWebAuthn"
    FROM "Session" s
    JOIN "User" u ON u."id" = s."userId"
    LEFT JOIN "Organization" o ON o."id" = u."organizationId"
    WHERE s."tokenHash" = ${tokenHash}`;
}

/**
 * Validate a session token and return the user if valid.
 * The raw token comes from the cookie; we hash it before lookup so the
 * database never sees the unhashed value.
 */
export async function validateSession(
  token: string,
): Promise<SessionUser | null> {
  const [session] = await prisma.$queryRaw<SessionLookupRow[]>(sessionLookup(hashSessionToken(token)));

  if (!session) return null;
  if (session.isRevoked) return null;
  if (session.expiresAt < new Date()) return null;
  if (!session.isActive) return null;

  // Update last active timestamp (debounce: only if >5 min since last update)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (!session.lastActiveAt || session.lastActiveAt < fiveMinAgo) {
    prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    }).catch((err) => console.error("[SESSION] Failed to update lastActiveAt:", err));
  }

  return {
    id: session.userId,
    email: session.email,
    name: session.name,
    image: session.image,
    role: mapLegacyRole(session.role),
    organizationId: session.organizationId,
    organizationMfaPolicy: session.organizationMfaPolicy ?? null,
    mfaEnabled: session.mfaEnabled,
    mfaVerified: session.mfaVerified,
    hasWebAuthn: session.hasWebAuthn,
    passkeyAssertedAt: session.passkeyAssertedAt,
    authMethod: "session",
  };
}

/**
 * Rotate a session token — issues a new token for the same session.
 * Use after sensitive operations (MFA verify, role change) to prevent
 * session fixation attacks.
 */
export async function rotateSessionToken(
  oldToken: string,
): Promise<string | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(oldToken) },
    select: { id: true, isRevoked: true, expiresAt: true },
  });

  if (!session || session.isRevoked || session.expiresAt < new Date()) {
    return null;
  }

  const newToken = generateSessionToken();
  await prisma.session.update({
    where: { id: session.id },
    data: { tokenHash: hashSessionToken(newToken) },
  });

  return newToken;
}

/**
 * Mark a session as MFA-verified.
 *
 * NOT A PASSKEY ASSERTION, and it does not stamp `passkeyAssertedAt`. Passkey
 * registration calls it too, and registering proves only that the caller holds
 * the session — which is exactly what a stolen cookie gives an attacker, who
 * could otherwise enrol an authenticator of their own and count as stepped up
 * (lib/auth/step-up.ts). Only an assertion records one:
 * `markSessionPasskeyAsserted` (sign-in) and `recordStepUpAssertion` (step-up).
 */
export async function markSessionMfaVerified(token: string): Promise<void> {
  await prisma.session.update({
    where: { tokenHash: hashSessionToken(token) },
    data: {
      mfaVerified: true,
      mfaVerifiedAt: new Date(),
    },
  });
}

/**
 * Record a passkey SIGN-IN on the session it just minted.
 *
 * The person has asserted a passkey to get this session, so it is MFA-verified
 * and a governance action in the next few minutes needs no second prompt.
 * Returns the time recorded.
 */
export async function markSessionPasskeyAsserted(token: string): Promise<Date> {
  const now = new Date();
  await prisma.session.update({
    where: { tokenHash: hashSessionToken(token) },
    data: {
      mfaVerified: true,
      mfaVerifiedAt: now,
      passkeyAssertedAt: now,
    },
  });
  return now;
}

function hashChallenge(challenge: string): string {
  return createHash("sha256").update(challenge).digest("hex");
}

/**
 * Remember the step-up challenge just issued to this session, replacing any
 * earlier one: only the latest step-up a session started can complete.
 */
export async function issueStepUpChallenge(token: string, challenge: string): Promise<void> {
  await prisma.session.update({
    where: { tokenHash: hashSessionToken(token) },
    data: { stepUpChallengeHash: hashChallenge(challenge) },
  });
}

/**
 * Record a passkey STEP-UP on an existing session, consuming its challenge.
 *
 * Unlike the sign-in above, this does not mint a session: the person is
 * already signed in and is proving, again and now, that they hold their
 * passkey. A passkey assertion satisfies MFA, so the session is marked verified
 * as well.
 *
 * ONCE, AND ONLY HERE. The challenge cookie is stateless — deleting it is a
 * request the client may ignore — so a captured step-up (cookie and body)
 * would otherwise verify again, on any session of the same person, until the
 * cookie expired. The challenge must be the one `issueStepUpChallenge` stored
 * on THIS session, and the write that stamps the assertion clears it, so a
 * second use, a use on another session, or a challenge minted by the public
 * sign-in options all match nothing. Returns the time recorded, or null when
 * the challenge was not this session's outstanding one.
 */
export async function recordStepUpAssertion(token: string, challenge: string): Promise<Date | null> {
  const now = new Date();
  const stamped = await prisma.session.updateMany({
    where: {
      tokenHash: hashSessionToken(token),
      stepUpChallengeHash: hashChallenge(challenge),
      isRevoked: false,
    },
    data: {
      stepUpChallengeHash: null,
      mfaVerified: true,
      mfaVerifiedAt: now,
      passkeyAssertedAt: now,
    },
  });
  return stamped.count === 1 ? now : null;
}

/**
 * Revoke a session by token.
 */
export async function revokeSession(
  token: string,
  reason: string,
): Promise<void> {
  await prisma.session.update({
    where: { tokenHash: hashSessionToken(token) },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: reason,
    },
  });
}

/**
 * Get the current session token from cookies.
 */
export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * Get the current authenticated user from the session cookie.
 * The magic link flow routes through /api/auth/bridge which creates
 * the custom session and sets this cookie before redirecting to the portal.
 * Wrapped with React cache() to deduplicate within a single RSC render pass.
 */
async function _getCurrentUser(): Promise<SessionUser | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return validateSession(token);
}

export const getCurrentUser = cache(_getCurrentUser);

/**
 * Standard cookie options for session cookies.
 * Centralized to prevent drift across auth endpoints.
 */
export function getSessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: APP_CONFIG.sessionMaxAgeHours * 60 * 60,
  };
}
