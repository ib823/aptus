/** Session management utilities */

import { cache } from "react";
import { createHash, randomBytes } from "crypto";
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

/**
 * Validate a session token and return the user if valid.
 * The raw token comes from the cookie; we hash it before lookup so the
 * database never sees the unhashed value.
 */
export async function validateSession(
  token: string,
): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      isRevoked: true,
      expiresAt: true,
      lastActiveAt: true,
      mfaVerified: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          role: true,
          organizationId: true,
          mfaEnabled: true,
          isActive: true,
          organization: { select: { mfaPolicy: true } },
          _count: { select: { webauthnCredentials: true } },
        },
      },
    },
  });

  if (!session) return null;
  if (session.isRevoked) return null;
  if (session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;

  // Update last active timestamp (debounce: only if >5 min since last update)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  if (!session.lastActiveAt || session.lastActiveAt < fiveMinAgo) {
    prisma.session.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    }).catch((err) => console.error("[SESSION] Failed to update lastActiveAt:", err));
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
    role: mapLegacyRole(session.user.role),
    organizationId: session.user.organizationId,
    organizationMfaPolicy: session.user.organization?.mfaPolicy ?? null,
    mfaEnabled: session.user.mfaEnabled,
    mfaVerified: session.mfaVerified,
    hasWebAuthn: session.user._count.webauthnCredentials > 0,
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
