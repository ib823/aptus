/** Phase 17: Role migration utility — maps legacy 5-role names to new 11-role names */

import { ALL_USER_ROLES, type UserRole } from "@/types/assessment";

const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  admin: "platform_admin",
  executive: "executive_sponsor",
  consultant: "consultant",
  process_owner: "process_owner",
  it_lead: "it_lead",
};

/**
 * All valid UserRole values — used for runtime validation in mapLegacyRole.
 *
 * DERIVED, and it used to be hand-written. As a hand-written `Set<string>` a
 * missing role compiled cleanly and then resolved to `viewer` here in
 * `mapLegacyRole` — the input to `isAdminRole`, `getCapabilities`,
 * `hasPermission` and `canAssignRole`. A new role appeared to work everywhere it
 * was displayed and quietly held viewer's permissions everywhere it was
 * enforced.
 *
 * That is what happened to `support`. The exhaustive `Record<UserRole, …>` maps
 * all failed the compiler loudly; this list failed silently, and the only thing
 * that caught it was a privilege-escalation test —
 * `canAssignRole("viewer", "support")` returned true, because `support` had
 * collapsed to `viewer` and a role may assign its own level.
 *
 * Building it from `ALL_USER_ROLES` removes the possibility rather than warning
 * about it: that list is `Object.keys` of a `Record<UserRole, …>`, so the
 * compiler now refuses the next role until it is declared.
 */
const VALID_ROLES: ReadonlySet<string> = new Set<string>(ALL_USER_ROLES);

/**
 * Map a legacy role name to the current role system.
 * If the role is already a valid new role, pass it through unchanged.
 * If the role is unrecognized, defaults to "viewer" as a safe fallback.
 */
export function mapLegacyRole(role: string): UserRole {
  const mapped = LEGACY_ROLE_MAP[role];
  if (mapped) return mapped;
  if (VALID_ROLES.has(role)) return role as UserRole;
  return "viewer";
}

/**
 * Check if a role string is a legacy role name that needs mapping.
 */
export function isLegacyRole(role: string): boolean {
  return role === "admin" || role === "executive";
}

/**
 * Is this role an admin-level role, after legacy mapping?
 *
 * THE DEAD STRING THIS REPLACES (audit E14, P2). Four places hand-wrote
 * `["platform_admin", "admin"].includes(user.role)` — the admin layout, the
 * brownfield guide content route, the portal nav and the mobile tab bar.
 * `"admin"` is a `LegacyUserRole` and not a member of `UserRole`, so as a literal
 * it is dead: no session carries it, and TypeScript cannot say so because
 * `.includes` on a `string[]` accepts anything.
 *
 * IT IS NOT DELETED, IT IS MOVED TO WHERE IT IS ALREADY HANDLED. Simply dropping
 * `"admin"` from those arrays would change behaviour for any row still holding
 * the legacy value — locking a real administrator out rather than tidying a
 * string. `mapLegacyRole` already maps it to `platform_admin`, has done since
 * Phase 17, and is the function `isAdminRole` in `lib/auth/permissions` already
 * delegates to. So the four copies become one call to the rule that was always
 * the real one.
 *
 * LIVES HERE, NOT IN `permissions.ts`, because two of the four callers are client
 * components and `permissions.ts` imports prisma. This module imports nothing but
 * types; `lib-layering.test.ts` is what keeps that true.
 */
export function isAdminRoleName(role: string | null | undefined): boolean {
  if (!role) return false;
  return mapLegacyRole(role) === "platform_admin";
}
