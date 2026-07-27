/**
 * Northbound authentication — the per-solution client token.
 *
 * WHY THIS IS NOT A SESSION. Every existing SAP route here authenticates with
 * `getCurrentUser()`, i.e. a browser cookie. A developer's deployed application
 * has no cookie and no browser, so it cannot call those routes at all. That is
 * the whole reason the broker needs its own credential rather than reusing what
 * exists.
 *
 * THE TOKEN IS NEVER STORED. Only its SHA-256 hash is, exactly as session tokens
 * are handled in this codebase. The raw value is shown once at issue and never
 * again, so a database dump — or a support engineer reading a row — yields
 * nothing usable.
 *
 * Lookup is by hash, which is a single indexed equality: there is no scan and no
 * per-row comparison, so there is no timing signal to mine for a valid token.
 */

import { createHash } from "crypto";

import { prisma } from "@/lib/db/prisma";
import { tenantScopeOf, type TenantScope } from "@/lib/studio/tenant-scope";

/** Tokens are prefixed so a leaked string is recognisable in logs and greppable. */
export const CLIENT_TOKEN_PREFIX = "ce_";

export function hashClientToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Pull the bearer credential out of an Authorization header. */
export function extractBearer(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}

export interface AuthenticatedClient {
  clientId: string;
  organizationId: string;
  solutionId: string;
  environment: string;
  /** Proof of tenancy, so every downstream query is structurally scoped. */
  scope: TenantScope;
}

export type ClientAuthFailure =
  | "NO_TOKEN"
  | "UNKNOWN_TOKEN"
  | "INACTIVE"
  | "REVOKED"
  | "EXPIRED";

export type ClientAuthResult =
  | { ok: true; client: AuthenticatedClient }
  | { ok: false; reason: ClientAuthFailure };

/**
 * Resolve a raw bearer token to the client it identifies.
 *
 * Every failure mode is reported distinctly HERE so it can be audited and
 * debugged — but the ROUTE deliberately collapses them all into one generic 401
 * for the caller. Telling an attacker "that token existed but is revoked" is a
 * free oracle; telling ourselves is operationally necessary.
 */
export async function authenticateClientToken(
  rawToken: string | null,
  now: Date = new Date(),
): Promise<ClientAuthResult> {
  if (!rawToken) return { ok: false, reason: "NO_TOKEN" };

  const row = await prisma.solutionClient.findUnique({
    where: { tokenHash: hashClientToken(rawToken) },
    select: {
      id: true,
      organizationId: true,
      solutionId: true,
      environment: true,
      isActive: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!row) return { ok: false, reason: "UNKNOWN_TOKEN" };
  // Revocation is checked before "inactive": a revoked token is a security
  // event worth seeing in the audit as exactly that.
  if (row.revokedAt !== null) return { ok: false, reason: "REVOKED" };
  if (!row.isActive) return { ok: false, reason: "INACTIVE" };
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "EXPIRED" };
  }

  return {
    ok: true,
    client: {
      clientId: row.id,
      organizationId: row.organizationId,
      solutionId: row.solutionId,
      environment: row.environment,
      scope: tenantScopeOf(row.organizationId),
    },
  };
}

/**
 * Record that a token was used.
 *
 * Best-effort and fire-and-forget: a failure to update a timestamp must never
 * fail a caller's read. It exists so an unused credential can be spotted and
 * retired, and so a leaked one shows activity.
 */
export async function touchClientLastUsed(
  clientId: string,
  organizationId: string,
): Promise<void> {
  try {
    await prisma.solutionClient.update({
      // Both, not just the id: the update re-asserts the tenant rather than
      // trusting that whoever passed the id had already established it.
      where: { id: clientId, organizationId },
      data: { lastUsedAt: new Date() },
    });
  } catch (err) {
    console.warn("[northbound] failed to update lastUsedAt", { clientId, err });
  }
}
