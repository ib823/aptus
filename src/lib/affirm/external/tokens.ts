/**
 * ABeam Workbench — Affirm external token helpers.
 *
 * Two credential kinds share the same construction:
 *   - Grant invite token: raw = 32 random bytes base64url; appears ONLY in
 *     the invite URL (https://{host}/a/{rawToken}). We persist SHA-256(raw)
 *     as AffirmAccessGrant.tokenHash and resolve by hash.
 *   - Guest session token: same mint; raw lives in the `affirm-guest` cookie,
 *     SHA-256(raw) persisted as AffirmGuestSession.tokenHash.
 *
 * Hashing at rest means a DB read never exposes a usable credential, and a
 * leaked backup cannot be replayed against the surface.
 */

import { createHash, randomBytes } from "crypto";

/** Mint a fresh raw token (32 bytes → 43-char base64url). */
export function mintRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex of a raw token; the stored form. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Mint a token and return both halves. Persist `tokenHash`; surface `raw`
 * exactly once (invite URL or Set-Cookie) and never store it.
 */
export function mintToken(): { raw: string; tokenHash: string } {
  const raw = mintRawToken();
  return { raw, tokenHash: hashToken(raw) };
}
