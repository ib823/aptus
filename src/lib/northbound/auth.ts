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
import { LEGACY_TOKEN_PREFIX, overlapIsOpen, overlapStillBound } from "@/lib/northbound/key-policy";
import { tenantScopeOf, type TenantScope } from "@/lib/studio/tenant-scope";

/**
 * Tokens are prefixed so a leaked string is recognisable in logs and greppable.
 *
 * Every runtime key starts with `ce_`. Since P0.11 a new key carries
 * `ce_live_` (PROD) or `ce_test_` (every other environment) — see
 * lib/northbound/key-policy.ts — and a key minted before then carries the
 * plain `ce_` prefix and keeps working until it expires. Authentication never
 * reads the prefix: the hash is the lookup, so no prefix is ever refused.
 */
export const CLIENT_TOKEN_PREFIX = LEGACY_TOKEN_PREFIX;

export function hashClientToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// Re-exported so every route keeps its import; the parser lives where the edge
// middleware can reach it too (see bearer.ts).
export { extractBearer } from "@/lib/northbound/bearer";

export interface AuthenticatedClient {
  clientId: string;
  organizationId: string;
  solutionId: string;
  environment: string;
  /**
   * The SAP client this credential is bound to, or null when it names none.
   *
   * Carried alongside `environment` because the two together are the binding:
   * on-premise and RISE put several data containers in one landscape, so the
   * environment alone cannot say which the caller may read.
   */
  sapClient: string | null;
  /** Proof of tenancy, so every downstream query is structurally scoped. */
  scope: TenantScope;
}

export type ClientAuthFailure =
  | "NO_TOKEN"
  | "UNKNOWN_TOKEN"
  | "INACTIVE"
  | "REVOKED"
  | "EXPIRED"
  /**
   * The token is the key a rotation replaced, and its overlap window has
   * closed (P0.11). Reported apart from EXPIRED because the remedy differs:
   * the credential itself is fine, and the caller only has to deploy the key
   * it was given at rotation.
   */
  | "ROTATED_OUT"
  /**
   * The credential is fine; the SOLUTION it belongs to has been retired.
   *
   * Nothing on the northbound path ever loaded the solution: the token, the
   * grant and the interface were each checked, and none of them consult the
   * status of the thing that owns them. So `Solution.status = RETIRED` — the
   * closest thing the product has to decommissioning — had no effect on the
   * runtime at all. A retired solution's credentials kept working until an
   * admin revoked each one by hand, and a duplicate solution retired precisely
   * so it could not be used again was still callable the moment after.
   *
   * RETIRED only, deliberately. RESTRICTED means an ACTIVE solution lost an
   * owner — a governance flag raised by a personnel change, not a decision to
   * stop the integration — and refusing it would take a running solution down
   * because someone left. Gating that is a product decision; this is not.
   */
  | "SOLUTION_RETIRED"
  /** The solution row is gone. An orphaned credential is refused, not served. */
  | "SOLUTION_MISSING";

export type ClientAuthResult =
  | { ok: true; client: AuthenticatedClient }
  | { ok: false; reason: ClientAuthFailure };

/** The two solution-level refusals, separated so a caller can reuse the check. */
export type SolutionRuntimeFailure = Extract<
  ClientAuthFailure,
  "SOLUTION_RETIRED" | "SOLUTION_MISSING"
>;

/**
 * Is the solution that owns a credential still callable?
 *
 * Exported because the Test Console's dry run resolves a credential ROW rather
 * than a bearer token, and so does not pass through authenticateClientToken. It
 * used to skip this check entirely, which made the console the one place a
 * RETIRED solution still appeared to work — the precise failure this gate was
 * added to close. One function, so the two paths cannot drift again.
 *
 * Scoped by organization as well as id, like every other query on this path.
 */
export async function checkSolutionRuntime(
  organizationId: string,
  solutionId: string,
): Promise<{ ok: true } | { ok: false; reason: SolutionRuntimeFailure }> {
  const solution = await prisma.solution.findFirst({
    where: { id: solutionId, organizationId },
    select: { status: true },
  });
  if (!solution) return { ok: false, reason: "SOLUTION_MISSING" };
  if (solution.status === "RETIRED") return { ok: false, reason: "SOLUTION_RETIRED" };
  return { ok: true };
}

/** What authentication reads from the row. Never the hashes, never the sealed write key. */
const AUTH_SELECT = {
  id: true,
  organizationId: true,
  solutionId: true,
  environment: true,
  sapClient: true,
  isActive: true,
  revokedAt: true,
  expiresAt: true,
  previousValidUntil: true,
} as const;

/**
 * What the lookup by the PREVIOUS hash reads: the same, plus the two hashes
 * that say whether the overlap still belongs to the row's current key
 * (`overlapStillBound`). They are compared here and never leave this module.
 */
const PREVIOUS_KEY_SELECT = { ...AUTH_SELECT, tokenHash: true, overlapForTokenHash: true } as const;

/**
 * Resolve a raw bearer token to the client it identifies.
 *
 * Every failure mode is reported distinctly HERE so it can be audited and
 * debugged — but the ROUTE deliberately collapses them all into one generic 401
 * for the caller. Telling an attacker "that token existed but is revoked" is a
 * free oracle; telling ourselves is operationally necessary.
 *
 * THE ROTATION OVERLAP (P0.11). A token that is not any row's current key may
 * be the key a rotation replaced: it is looked up by `previousTokenHash`, the
 * same single indexed equality on a unique column, and accepted while
 * `previousValidUntil` is in the future. It resolves to the SAME row, so
 * everything else — revocation, deactivation, the row's own expiry, the
 * solution gate, and the write key sealed on the row — applies to it exactly
 * as to the current key. That is what makes "revoke ends both at once" a
 * property of one `revokedAt` rather than of a second check someone must
 * remember.
 *
 * The overlap is also honoured only while it is still bound to the row's
 * current key (key-policy.ts `overlapStillBound`): a `tokenHash` written by
 * anything that did not write the overlap with it — above all a build from
 * before P0.11, after a rollback — closes the window rather than inheriting it.
 */
export async function authenticateClientToken(
  rawToken: string | null,
  now: Date = new Date(),
): Promise<ClientAuthResult> {
  if (!rawToken) return { ok: false, reason: "NO_TOKEN" };

  const tokenHash = hashClientToken(rawToken);
  let viaPreviousKey = false;
  let previousKeyBound = false;
  let row = await prisma.solutionClient.findUnique({ where: { tokenHash }, select: AUTH_SELECT });
  if (!row) {
    // Only on a miss, so a current key costs one lookup as it always did.
    const previous = await prisma.solutionClient.findUnique({
      where: { previousTokenHash: tokenHash },
      select: PREVIOUS_KEY_SELECT,
    });
    viaPreviousKey = previous !== null;
    previousKeyBound = previous !== null && overlapStillBound(previous);
    row = previous;
  }
  if (!row) {
    /*
     * A KEY THE ROW HAS DROPPED (wave 1a final review): replaced after a
     * revocation, pushed out by a second rotation, or rotated with the
     * overlap off. It resolves to its row only to be refused — REVOKED or
     * INACTIVE if the row is, ROTATED_OUT otherwise, never authenticated —
     * so it is a real key that refuses, bounded by its own edge bucket, and
     * not an UNKNOWN_TOKEN spending its caller ADDRESS's failed-lookup
     * bucket, where one tenant's dead key behind a shared egress locked out
     * every other tenant's valid key (auth-failures.ts). Only on a miss of
     * both lookups above, so a live key costs what it did.
     */
    const retired = await prisma.retiredClientToken.findUnique({
      where: { tokenHash },
      select: { client: { select: AUTH_SELECT } },
    });
    if (retired) {
      viaPreviousKey = true;
      previousKeyBound = false;
      row = retired.client;
    }
  }

  if (!row) return { ok: false, reason: "UNKNOWN_TOKEN" };
  // Revocation is checked before "inactive": a revoked token is a security
  // event worth seeing in the audit as exactly that. It is also checked
  // before the overlap, so a revoked row refuses its previous key as REVOKED.
  if (row.revokedAt !== null) return { ok: false, reason: "REVOKED" };
  if (!row.isActive) return { ok: false, reason: "INACTIVE" };
  if (viaPreviousKey && (!previousKeyBound || !overlapIsOpen(row.previousValidUntil, now))) {
    return { ok: false, reason: "ROTATED_OUT" };
  }
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "EXPIRED" };
  }

  // Checked LAST, after the token's own states: a revoked token on a retired
  // solution should audit as REVOKED, which is the more specific event.
  const solution = await checkSolutionRuntime(row.organizationId, row.solutionId);
  if (!solution.ok) return { ok: false, reason: solution.reason };

  return {
    ok: true,
    client: {
      clientId: row.id,
      organizationId: row.organizationId,
      solutionId: row.solutionId,
      environment: row.environment,
      sapClient: row.sapClient,
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
