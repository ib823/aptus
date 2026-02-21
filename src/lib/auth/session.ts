/** Session management utilities */

import { cache } from "react";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { APP_CONFIG } from "@/constants/config";
import type { SessionUser } from "@/types/assessment";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "fit-portal-session";

/**
 * Generate a cryptographically secure session token.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Create a new session for a user, revoking any existing sessions.
 */
export async function createSession(
  userId: string,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<string> {
  // Revoke existing sessions (concurrent session limit = 1)
  await prisma.session.updateMany({
    where: {
      userId,
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: "concurrent_login",
    },
  });

  const token = generateSessionToken();
  const expiresAt = new Date(
    Date.now() + APP_CONFIG.sessionMaxAgeHours * 60 * 60 * 1000,
  );

  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
      ipAddress,
      userAgent,
    },
  });

  return token;
}

/**
 * Validate a session token and return the user if valid.
 */
export async function validateSession(
  token: string,
): Promise<SessionUser | null> {
  const session = await prisma.session.findUnique({
    where: { token },
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
          role: true,
          organizationId: true,
          mfaEnabled: true,
          totpVerified: true,
          isActive: true,
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
    }).catch(() => {/* fire-and-forget */});
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as SessionUser["role"],
    organizationId: session.user.organizationId,
    mfaEnabled: session.user.mfaEnabled,
    mfaVerified: session.mfaVerified,
    totpVerified: session.user.totpVerified,
  };
}

/**
 * Mark a session as MFA-verified.
 */
export async function markSessionMfaVerified(token: string): Promise<void> {
  await prisma.session.update({
    where: { token },
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
    where: { token },
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
