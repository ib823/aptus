/**
 * Structural tenant scoping.
 *
 * WHY THIS EXISTS. Every tenant-anchored query in this codebase currently relies
 * on the author remembering `where: { organizationId }`. That convention has
 * failed here repeatedly — three cross-tenant IDOR routes were found and fixed in
 * a single audit (discovery pack export, presales grant reissue, grant-email
 * correction), all the same shape: a lookup by caller-supplied id that forgot the
 * org filter. Each had passing tests. None of the tests were wrong; they simply
 * did not test the thing that was missing.
 *
 * A rule you must remember is a rule you will eventually forget, and this is
 * about to matter far more: PR-D2 opens the first EXTERNALLY-callable surface
 * that brokers a client's live SAP data. So scoping stops being a convention and
 * becomes a type.
 *
 * HOW IT WORKS. You cannot call these helpers without a `TenantScope`, and the
 * only way to obtain one is `tenantScopeFor(user)`, which refuses a user with no
 * organization. The scope then INJECTS `organizationId` into the where-clause
 * itself, so "forgetting" it is not an available mistake — there is no argument
 * to omit.
 *
 * This does not replace Prisma. It wraps the small number of tenant-anchored
 * lookups where getting it wrong means one client reads another's data.
 */

import type { Prisma } from "@prisma/client";

import { isAdminRole } from "@/lib/auth/permissions";

/**
 * Type-level brand. `declare const` means it does not exist at runtime — it only
 * makes the interface unforgeable at compile time, so a bare `{ organizationId }`
 * cannot be passed off as a scope.
 */
declare const tenantScopeBrand: unique symbol;

/**
 * Proof that a caller has a tenant to be scoped to. Deliberately opaque: it is
 * only produced by the constructors below, so a caller cannot fabricate one from
 * a request parameter.
 */
export interface TenantScope {
  readonly organizationId: string;
  readonly [tenantScopeBrand]: true;
}

export type ScopeFailure =
  | { ok: false; reason: "NO_ORGANIZATION" }
  | { ok: false; reason: "ADMIN_WITHOUT_ORGANIZATION" };

export type ScopeResult = { ok: true; scope: TenantScope } | ScopeFailure;

/**
 * The only way to make a TenantScope.
 *
 * A platform_admin may legitimately carry a null organization, and that is
 * exactly the case that must NOT silently widen a query to every tenant. It is
 * reported distinctly so a caller can say "pick an organization" instead of
 * "forbidden", but it still cannot produce a scope.
 */
export function tenantScopeFor(user: {
  organizationId: string | null;
  role?: string | null;
}): ScopeResult {
  if (!user.organizationId) {
    return {
      ok: false,
      reason: isAdminRole(user.role ?? "") ? "ADMIN_WITHOUT_ORGANIZATION" : "NO_ORGANIZATION",
    };
  }
  return { ok: true, scope: tenantScopeOf(user.organizationId) };
}

/**
 * Build a scope from an organization id that the SERVER already resolved.
 *
 * The cast is the one place the brand is applied, which is why it lives here and
 * nowhere else: callers cannot mint a scope from request input without going
 * through a function that has already established the tenant.
 */
export function tenantScopeOf(organizationId: string): TenantScope {
  return { organizationId } as TenantScope;
}

export function organizationIdOf(scope: TenantScope): string {
  return scope.organizationId;
}

/**
 * Merge a caller's filter with the scope's organizationId.
 *
 * The scope is applied LAST and overwrites any organizationId in the incoming
 * filter, so a request-supplied value can never widen or redirect the query —
 * the worst a caller can do is agree with the truth.
 */
export function scopedWhere<T extends Record<string, unknown>>(
  scope: TenantScope,
  where?: T,
): T & { organizationId: string } {
  return { ...(where ?? ({} as T)), organizationId: scope.organizationId };
}

/**
 * Scope a `findFirst`-style lookup by a caller-supplied id.
 *
 * This is the exact shape that has gone wrong here before: an id arrives from a
 * URL, and the query trusts it. With a scope you cannot express the unsafe
 * version — the organization is not yours to leave out.
 *
 * Returns null-shaped criteria that a record in another tenant simply cannot
 * match, so "not yours" and "does not exist" are indistinguishable to the caller.
 */
export function scopedById(
  scope: TenantScope,
  id: string,
  extra?: Record<string, unknown>,
): { id: string; organizationId: string } & Record<string, unknown> {
  return { ...(extra ?? {}), id, organizationId: scope.organizationId };
}

/**
 * Data for a create, with the tenant stamped from the scope.
 *
 * Any organizationId in the incoming payload is overwritten — a caller must not
 * be able to plant a record in someone else's tenant.
 */
export function scopedCreateData<T extends Record<string, unknown>>(
  scope: TenantScope,
  data: T,
): T & { organizationId: string } {
  return { ...data, organizationId: scope.organizationId };
}

/**
 * A Prisma client extension that FAILS CLOSED on the tenant-anchored models.
 *
 * Belt to the braces above: if a query against one of these models somehow
 * reaches Prisma without an organizationId, it throws rather than returning
 * another tenant's rows. A loud failure in development is worth far more than a
 * silent cross-tenant read in production.
 *
 * Findable via `prisma.$extends(requireTenantScope())`. It is exported for the
 * app to opt into per-surface rather than applied globally, because several
 * legitimate callers (migrations, admin tooling, the seeder) operate across
 * tenants by design and should not be broken by a blanket rule.
 */
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
 * Requiring a scope here would be circular.
 *
 * It is safe for exactly one reason: `SolutionClient.tokenHash` is `@unique`, so
 * this can only ever return the single row whose hash was presented. It is not a
 * scan, and it cannot be widened into one — a caller who does not already hold
 * the token learns nothing.
 *
 * Deliberately narrow: model, operation AND the exact shape of the where-clause
 * must all match. A `findUnique` on SolutionClient by anything else, or a
 * `findFirst` that happens to mention tokenHash, is not exempt. Greppable on
 * purpose — this is the only hole in the guard and it should stay findable.
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
      `${model}.${operation} was called without an organizationId. Tenant-anchored models must be scoped — use lib/studio/tenant-scope helpers.`,
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
            !isUnscopedByDesign(model, operation, args)
          ) {
            throw new MissingTenantScopeError(model, operation);
          }
          return query(args);
        },
      },
    },
  } satisfies Prisma.Extension | Record<string, unknown>;
}
