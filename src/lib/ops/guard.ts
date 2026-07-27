/**
 * The shared preamble for every /api/ops/* read.
 *
 * WHAT IT GUARANTEES, in this order, before any query can run:
 *
 *   1. Authenticated.
 *   2. Entitled to the Operations Center (`support`, or an admin for oversight).
 *   3. Carrying a tenant — or an admin, who may legitimately have none.
 *
 * WHY A HELPER RATHER THAN A CONVENTION. Every endpoint behind it reads a feed
 * of live customer SAP activity. Repeating three checks across every route is
 * how one of them ends up with two, and the omission is invisible in review
 * because the route still works — it just works for the wrong people.
 *
 * THE ADMIN BRANCH IS EXPLICIT, NOT A FALLTHROUGH. A platform_admin may hold a
 * null organization, and the honest reading of "show me the traffic" for such a
 * caller is "all of it". That is a real capability and it is returned as its own
 * shape (`scope: null`), so a route has to handle it deliberately. The failure
 * this avoids: a helper that returns an empty filter for an admin and is then
 * spread into a `where`, making an unscoped read look identical to a scoped one
 * at the call site.
 */

import { getCurrentUser } from "@/lib/auth/session";
import { studioError } from "@/lib/studio/api";
import { canAccessOperations } from "@/lib/studio/rbac";
import { scopedWhere, tenantScopeFor, type TenantScope } from "@/lib/studio/tenant-scope";

export type OpsActor =
  /** A tenant-bound caller. Every query MUST go through this scope. */
  | { kind: "scoped"; scope: TenantScope; organizationId: string; userId: string }
  /** A global admin with no organization. Reads across tenants, deliberately. */
  | { kind: "global"; scope: null; organizationId: null; userId: string };

export type OpsGuardResult =
  | { ok: true; actor: OpsActor }
  | { ok: false; response: ReturnType<typeof studioError> };

export async function requireOperations(): Promise<OpsGuardResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: studioError("UNAUTHENTICATED", "Sign in required.") };
  }
  if (!canAccessOperations(user.role)) {
    return { ok: false, response: studioError("FORBIDDEN", "Operations Center is role-gated.") };
  }

  const scoped = tenantScopeFor(user);
  if (scoped.ok) {
    return {
      ok: true,
      actor: {
        kind: "scoped",
        scope: scoped.scope,
        organizationId: scoped.scope.organizationId,
        userId: user.id,
      },
    };
  }

  // Only an admin may read without a tenant. Everyone else is refused here,
  // BEFORE a query runs — never allowed to fall through to an unscoped read.
  if (scoped.reason === "ADMIN_WITHOUT_ORGANIZATION") {
    return { ok: true, actor: { kind: "global", scope: null, organizationId: null, userId: user.id } };
  }

  return { ok: false, response: studioError("FORBIDDEN", "No organization scope.") };
}

/**
 * Build the `where` for an Operations Center query.
 *
 * THE ONLY PLACE WIDENING IS EXPRESSIBLE — that was already the argument for
 * the previous `opsOrgFilter`, and it is a good one. What it did not give was
 * the second half: a caller had to remember to spread it. `where: { at: {...} }`
 * with the spread omitted compiles, runs, and reads across every tenant, and it
 * looks exactly like the scoped version at the call site.
 *
 * `opsWhere` cannot be called without an actor, and on the scoped branch it goes
 * through `scopedWhere`, which places `organizationId` LAST so a caller-supplied
 * one cannot win. The global branch stays explicit and separate: an admin with
 * no organization reading across tenants is a real capability, and it should
 * take a visible branch to get there rather than an absent field.
 *
 * The guard computed a branded `TenantScope` and no route used it; this is what
 * uses it.
 */
export function opsWhere<T extends Record<string, unknown>>(
  actor: OpsActor,
  where?: T,
): T & { organizationId?: string } {
  if (actor.kind === "scoped") return scopedWhere(actor.scope, where);
  // Deliberate cross-tenant read. Named, not implied.
  return (where ?? ({} as T)) as T & { organizationId?: string };
}

/** Clamp a caller-supplied window to something a dashboard can actually plot. */
export function opsWindowHours(raw: string | null, fallback = 24): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 24 * 30);
}

/** Clamp a caller-supplied row limit. Silent truncation is never acceptable. */
export function opsLimit(raw: string | null, fallback = 100, max = 500): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}
