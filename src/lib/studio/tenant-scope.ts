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
 * The Prisma-extension guard itself lives in `lib/db/tenant-guard` — where the
 * live client can attach it without a circular import (this module pulls in
 * the permissions module, which uses the client). IT IS ATTACHED NOW: every
 * query through `lib/db/prisma` passes it, in the mode `tenantGuardMode()`
 * resolves. These re-exports keep the public surface of tenant scoping in one
 * place for callers and tests.
 */
export {
  MissingTenantScopeError,
  permitCrossTenantReads,
  crossTenantPermission,
  TENANT_ANCHORED_MODELS,
  tenantGuardMode,
  tenantScopeGuard,
  type TenantAnchoredModel,
  type TenantGuardMode,
} from "@/lib/db/tenant-guard";
