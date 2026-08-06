/**
 * The tenant-scope guard, attached to the LIVE Prisma client.
 *
 * `tenantScopeGuard()` existed as an exported factory that nothing applied —
 * a declared control the runtime did not enforce, which is this phase's exact
 * failure signature. It lives here (not in lib/studio/tenant-scope) so that
 * `lib/db/prisma` can attach it without a circular import: tenant-scope pulls
 * in the permissions module, which itself uses the Prisma client.
 *
 * THREE MODES, env-controlled via TENANT_SCOPE_GUARD:
 *   throw — a query against a tenant-anchored model with no organizationId in
 *           its where fails loudly. Default outside production.
 *   log   — the violation is logged and the query runs. Default IN production,
 *           as the burn-in: flip to throw once production logs show zero
 *           violations. A legitimate path the burn-down missed should show up
 *           as a log line, never as an outage.
 *   off   — the guard does nothing (escape hatch, not a steady state).
 *
 * DELIBERATE CROSS-TENANT READS ARE DECLARED, NOT INFERRED. A platform admin
 * with no organization reading every tenant's feed is a real capability; the
 * ops guard marks the request's async context via `permitCrossTenantReads`,
 * and so do the scheduled sweeps that serve every tenant in one run. The
 * declaration is context-scoped (AsyncLocalStorage), so it cannot leak from
 * one request into another.
 */

// Bare specifier, not `node:async_hooks`: client components transitively reach
// lib/db/prisma (via long-standing import chains that work because
// @prisma/client ships a browser stub), and webpack cannot bundle the node:
// scheme at all. The bare form resolves to an empty module on the client (see
// next.config.ts fallback), so the guard is inert exactly where no query runs.
import { AsyncLocalStorage } from "async_hooks";

import type { Prisma } from "@prisma/client";

/** Models whose queries must carry a tenant. Mirrored by tenant-scope.ts. */
export const TENANT_ANCHORED_MODELS = [
  "Solution",
  "Interface",
  "ApiAccessGrant",
  "TestCase",
  "ConfigAudit",
  "SapConnection",
  "SolutionClient",
  "NorthboundAuditEvent",
  "MockFixture",
  // Carries organizationId in its unique key; was missing from this list, so
  // the guard could not see it. complete/release address rows by server-derived
  // id (safe), but the model is tenant-anchored and the roster should say so.
  "NorthboundIdempotencyKey",
] as const;

export type TenantAnchoredModel = (typeof TENANT_ANCHORED_MODELS)[number];

/** Operations whose `where` must carry a tenant. Creates are covered separately. */
const SCOPED_OPERATIONS = new Set([
  "findFirst",
  "findMany",
  "findUnique",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

// Undefined in a client bundle (empty-module fallback) — every consumer below
// guards on that, and no Prisma query exists client-side to need it.
const crossTenantContext =
  typeof AsyncLocalStorage === "function"
    ? new AsyncLocalStorage<{ reason: string }>()
    : null;

/**
 * Declare that the CURRENT async context performs deliberate cross-tenant
 * reads. Called by the ops guard's global-admin branch and by scheduled sweeps
 * — the two places where "no organizationId" is the design, not a bug. The
 * reason string is for the log line when someone asks why a context is exempt.
 */
export function permitCrossTenantReads(reason: string): void {
  crossTenantContext?.enterWith({ reason });
}

/** Exposed for the guard and for tests; null when nothing was declared. */
export function crossTenantPermission(): { reason: string } | null {
  return crossTenantContext?.getStore() ?? null;
}

export type TenantGuardMode = "throw" | "log" | "off";

export function tenantGuardMode(): TenantGuardMode {
  const raw = process.env.TENANT_SCOPE_GUARD;
  if (raw === "throw" || raw === "log" || raw === "off") return raw;
  // Loud where it costs nothing; observed-first where an unexercised
  // legitimate path would otherwise become an outage.
  return process.env.NODE_ENV === "production" ? "log" : "throw";
}

function whereHasOrganization(args: unknown): boolean {
  if (!args || typeof args !== "object") return false;
  const where = (args as { where?: unknown }).where;
  if (!where || typeof where !== "object") return false;
  if ("organizationId" in (where as Record<string, unknown>)) return true;
  // A nested relation filter (e.g. { bundle: { organizationId } }) also scopes.
  return JSON.stringify(where).includes("organizationId");
}

/**
 * The ONE query that cannot carry a tenant, and why.
 *
 * `authenticateClientToken` looks a client up BY ITS TOKEN HASH. There is no
 * organization to scope it to, because the organization is the OUTPUT of this
 * lookup — it is how an unauthenticated bearer token becomes a tenant at all.
 * Safe because `SolutionClient.tokenHash` is `@unique`: it can only return the
 * single row whose hash was presented, and a caller who does not already hold
 * the token learns nothing. Deliberately narrow — model, operation AND the
 * exact where-shape must all match.
 */
function isUnscopedByDesign(model: string, operation: string, args: unknown): boolean {
  if (model !== "SolutionClient" || operation !== "findUnique") return false;
  if (!args || typeof args !== "object") return false;
  const where = (args as { where?: unknown }).where;
  if (!where || typeof where !== "object") return false;
  const keys = Object.keys(where as Record<string, unknown>);
  return keys.length === 1 && keys[0] === "tokenHash";
}

export class MissingTenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(
      `${model}.${operation} was called without an organizationId. Tenant-anchored models must be scoped — use lib/studio/tenant-scope helpers, or declare a deliberate cross-tenant context via permitCrossTenantReads.`,
    );
    this.name = "MissingTenantScopeError";
  }
}

/**
 * Build the extension. Kept as a factory so tests can construct it without a
 * live client.
 */
export function tenantScopeGuard() {
  return {
    name: "requireTenantScope",
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model?: string;
          operation: string;
          args: unknown;
          query: (args: unknown) => Promise<unknown>;
        }) {
          if (
            model &&
            (TENANT_ANCHORED_MODELS as readonly string[]).includes(model) &&
            SCOPED_OPERATIONS.has(operation) &&
            !whereHasOrganization(args) &&
            !isUnscopedByDesign(model, operation, args) &&
            crossTenantContext?.getStore() === undefined
          ) {
            const mode = tenantGuardMode();
            if (mode === "throw") {
              throw new MissingTenantScopeError(model, operation);
            }
            if (mode === "log") {
              console.error(
                `[tenant-scope-guard] unscoped ${model}.${operation} permitted in log mode — burn this down, then flip TENANT_SCOPE_GUARD=throw`,
              );
            }
          }
          return query(args);
        },
      },
    },
  } satisfies Prisma.Extension | Record<string, unknown>;
}
