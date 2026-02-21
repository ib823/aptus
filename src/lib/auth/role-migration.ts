/** Phase 17: Role migration utility — maps legacy 5-role names to new 11-role names */

import type { UserRole } from "@/types/assessment";

const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  admin: "platform_admin",
  executive: "executive_sponsor",
  consultant: "consultant",
  process_owner: "process_owner",
  it_lead: "it_lead",
};

/**
 * Map a legacy role name to the new 11-role system.
 * If the role is already a valid new role, pass it through unchanged.
 * If the role is unrecognized, pass it through as-is (cast to UserRole).
 */
export function mapLegacyRole(role: string): UserRole {
  return LEGACY_ROLE_MAP[role] ?? (role as UserRole);
}

/**
 * Check if a role string is a legacy role name that needs mapping.
 */
export function isLegacyRole(role: string): boolean {
  return role === "admin" || role === "executive";
}
