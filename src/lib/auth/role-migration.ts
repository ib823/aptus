/** Phase 17: Role migration utility — maps legacy 5-role names to new 11-role names */

import type { UserRole } from "@/types/assessment";

const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  admin: "platform_admin",
  executive: "executive_sponsor",
  consultant: "consultant",
  process_owner: "process_owner",
  it_lead: "it_lead",
};

/** All valid UserRole values — used for runtime validation in mapLegacyRole */
const VALID_ROLES: Set<string> = new Set<string>([
  "platform_admin", "partner_lead", "consultant", "project_manager",
  "solution_architect", "process_owner", "it_lead", "data_migration_lead",
  "executive_sponsor", "viewer", "client_admin",
]);

/**
 * Map a legacy role name to the new 11-role system.
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
