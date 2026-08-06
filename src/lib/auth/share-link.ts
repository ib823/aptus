/**
 * Phase 12 — share-link auth for the customer-facing read-only portal.
 *
 * Buyer-side stakeholders open a signed link. We verify the token + check
 * expiry/revoke + increment the access counter. No login required.
 *
 * Token shape: 32 random bytes, urlsafe-base64 encoded. ~43 chars.
 *
 * STORED AS A HASH. The raw token IS the credential — anyone holding it reads
 * the assessment — so the database keeps only its SHA-256, exactly like
 * session and broker tokens: a database read (backup, log line, injection)
 * cannot become a usable link. Legacy rows still carrying plaintext are
 * dual-read: matched by their old column once, then upgraded in place (hash
 * written, plaintext nulled), so the window closes by itself as links are
 * used. No KDF needed — the token is 256 bits of entropy, not a password.
 */

import { createHash, randomBytes } from "crypto";
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

export function hashShareLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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

  const select = {
    id: true,
    assessmentId: true,
    scopeJson: true,
    expiresAt: true,
    revokedAt: true,
    tokenHash: true,
  } as const;

  // Primary: by hash. Legacy fallback: by the old plaintext column, for rows
  // issued before hashing landed — matched at most once each, see below.
  let row = await prisma.assessmentShareLink.findUnique({
    where: { tokenHash: hashShareLinkToken(token) },
    select,
  });
  if (!row) {
    row = await prisma.assessmentShareLink.findUnique({ where: { token }, select });
  }

  if (!row) throw new ShareLinkInvalid("UNKNOWN");
  if (row.revokedAt) throw new ShareLinkInvalid("REVOKED");
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) throw new ShareLinkInvalid("EXPIRED");

  // Access counter, plus the one-time upgrade of a legacy row: hash written,
  // plaintext nulled — the dual-read window closes by itself as links are
  // used. Best-effort; don't fail the request on bookkeeping.
  await prisma.assessmentShareLink.update({
    where: { id: row.id },
    data: {
      lastAccessedAt: new Date(),
      accessCount: { increment: 1 },
      ...(row.tokenHash === null
        ? { tokenHash: hashShareLinkToken(token), token: null }
        : {}),
    },
  }).catch(() => { /* swallow — access logging is best-effort */ });

  return {
    shareLinkId: row.id,
    assessmentId: row.assessmentId,
    scope: row.scopeJson as Record<string, unknown> | null,
    expiresAt: row.expiresAt,
  };
}
