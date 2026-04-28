/**
 * Phase 12 — share-link auth for the customer-facing read-only portal.
 *
 * Buyer-side stakeholders open a signed link. We verify the token + check
 * expiry/revoke + increment the access counter. No login required.
 *
 * Token shape: 32 random bytes, urlsafe-base64 encoded. ~43 chars.
 */

import { randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";

export interface ShareLinkContext {
  shareLinkId: string;
  assessmentId: string;
  scope: Record<string, unknown> | null;
  expiresAt: Date | null;
}

export function generateShareLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Validates an incoming share-link token. Returns the context on success;
 * throws ShareLinkInvalid on any rejection (expired, revoked, unknown).
 */
export class ShareLinkInvalid extends Error {
  constructor(public readonly reason: "UNKNOWN" | "EXPIRED" | "REVOKED") {
    super(`Share link invalid: ${reason}`);
    this.name = "ShareLinkInvalid";
  }
}

export async function verifyShareLink(token: string): Promise<ShareLinkContext> {
  // Token shape sanity (cheap reject before DB hit).
  if (!token || token.length < 32 || token.length > 64) {
    throw new ShareLinkInvalid("UNKNOWN");
  }

  const row = await prisma.assessmentShareLink.findUnique({
    where: { token },
    select: { id: true, assessmentId: true, scopeJson: true, expiresAt: true, revokedAt: true, token: true },
  });

  if (!row) throw new ShareLinkInvalid("UNKNOWN");
  if (row.revokedAt) throw new ShareLinkInvalid("REVOKED");
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) throw new ShareLinkInvalid("EXPIRED");

  // Constant-time token comparison (defence in depth — Prisma already
  // looked up by exact match, but a future where lookup gets fuzzy is
  // hereby armoured).
  const a = Buffer.from(row.token);
  const b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ShareLinkInvalid("UNKNOWN");
  }

  // Increment access counter (best-effort; don't fail the request on counter error)
  await prisma.assessmentShareLink.update({
    where: { id: row.id },
    data: {
      lastAccessedAt: new Date(),
      accessCount: { increment: 1 },
    },
  }).catch(() => { /* swallow — access logging is best-effort */ });

  return {
    shareLinkId: row.id,
    assessmentId: row.assessmentId,
    scope: row.scopeJson as Record<string, unknown> | null,
    expiresAt: row.expiresAt,
  };
}
