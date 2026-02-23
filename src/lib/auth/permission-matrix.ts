/** Phase 17: Fine-grained permission matrix for the 11-role system */

import type { UserRole } from "@/types/assessment";
import { mapLegacyRole } from "@/lib/auth/role-migration";

export type PermissionAction =
  // Assessment CRUD
  | "assessment.create"
  | "assessment.view"
  | "assessment.edit"
  | "assessment.delete"
  | "assessment.transition"
  // Profile
  | "profile.edit"
  // Scope
  | "scope.edit"
  | "scope.bulkSelect"
  // Step Review
  | "step.classify"
  | "step.addNote"
  // Gap Resolution
  | "gap.create"
  | "gap.edit"
  | "gap.approve"
  | "gap.addAlternative"
  // Registers
  | "integration.create"
  | "integration.edit"
  | "integration.delete"
  | "integration.approve"
  | "dataMigration.create"
  | "dataMigration.edit"
  | "dataMigration.delete"
  | "dataMigration.approve"
  | "ocm.create"
  | "ocm.edit"
  | "ocm.delete"
  | "ocm.approve"
  // Organization
  | "org.manage"
  | "org.viewAll"
  // User Management
  | "user.invite"
  | "user.deactivate"
  | "user.changeRole"
  // Reports
  | "report.view"
  | "report.export"
  // Sign-off
  | "signoff.execute"
  // Workshop
  | "workshop.create"
  | "workshop.facilitate"
  // Admin
  | "admin.accessPanel";

const ALL_ACTIONS: PermissionAction[] = [
  "assessment.create", "assessment.view", "assessment.edit", "assessment.delete", "assessment.transition",
  "profile.edit", "scope.edit", "scope.bulkSelect",
  "step.classify", "step.addNote",
  "gap.create", "gap.edit", "gap.approve", "gap.addAlternative",
  "integration.create", "integration.edit", "integration.delete", "integration.approve",
  "dataMigration.create", "dataMigration.edit", "dataMigration.delete", "dataMigration.approve",
  "ocm.create", "ocm.edit", "ocm.delete", "ocm.approve",
  "org.manage", "org.viewAll",
  "user.invite", "user.deactivate", "user.changeRole",
  "report.view", "report.export",
  "signoff.execute",
  "workshop.create", "workshop.facilitate",
  "admin.accessPanel",
];

/** Permission sets for each role */
export const PERMISSION_MATRIX: Record<UserRole, Set<PermissionAction>> = {
  platform_admin: new Set(ALL_ACTIONS),

  partner_lead: new Set([
    "assessment.create", "assessment.view", "assessment.edit", "assessment.transition",
    "profile.edit", "scope.edit", "scope.bulkSelect",
    "step.classify", "step.addNote",
    "gap.create", "gap.edit", "gap.approve", "gap.addAlternative",
    "integration.create", "integration.edit", "integration.delete", "integration.approve",
    "dataMigration.create", "dataMigration.edit", "dataMigration.delete", "dataMigration.approve",
    "ocm.create", "ocm.edit", "ocm.delete", "ocm.approve",
    "user.invite", "user.deactivate", "user.changeRole",
    "report.view", "report.export",
    "signoff.execute",
    "workshop.create", "workshop.facilitate",
  ]),

  consultant: new Set([
    "assessment.create", "assessment.view", "assessment.edit", "assessment.transition",
    "profile.edit", "scope.edit", "scope.bulkSelect",
    "step.classify", "step.addNote",
    "gap.create", "gap.edit", "gap.approve", "gap.addAlternative",
    "integration.create", "integration.edit", "integration.delete", "integration.approve",
    "dataMigration.create", "dataMigration.edit", "dataMigration.delete", "dataMigration.approve",
    "ocm.create", "ocm.edit", "ocm.delete", "ocm.approve",
    "report.view", "report.export",
    "workshop.create", "workshop.facilitate",
  ]),

  project_manager: new Set([
    "assessment.view", "assessment.transition",
    "scope.edit",
    "step.addNote",
    "gap.approve",
    "ocm.create", "ocm.edit",
    "report.view", "report.export",
    "workshop.create",
  ]),

  solution_architect: new Set([
    "assessment.view",
    "step.addNote",
    "gap.addAlternative",
    "integration.create", "integration.edit",
    "report.view", "report.export",
    "workshop.create", "workshop.facilitate",
  ]),

  process_owner: new Set([
    "assessment.view",
    "step.classify",
    "step.addNote",
    "gap.approve",
    "ocm.create",
    "ocm.edit",
    "report.view",
  ]),

  it_lead: new Set([
    "assessment.view",
    "step.addNote",
    "integration.create", "integration.edit",
    "dataMigration.create", "dataMigration.edit",
    "report.view", "report.export",
  ]),

  data_migration_lead: new Set([
    "assessment.view",
    "dataMigration.create", "dataMigration.edit", "dataMigration.delete",
    "report.view",
  ]),

  executive_sponsor: new Set([
    "assessment.view",
    "gap.approve",
    "report.view", "report.export",
    "signoff.execute",
  ]),

  viewer: new Set([
    "assessment.view",
    "report.view",
  ]),

  client_admin: new Set([
    "assessment.view",
    "user.invite", "user.deactivate",
    "report.view",
  ]),
};

/**
 * Check if a role has a specific permission.
 * Supports legacy role names via normalizeRole.
 */
export function hasPermission(role: string, action: PermissionAction): boolean {
  const normalized = mapLegacyRole(role);
  const perms = PERMISSION_MATRIX[normalized];
  return perms ? perms.has(action) : false;
}

/**
 * Require a permission or throw PermissionError.
 */
export function requirePermission(role: string, action: PermissionAction): void {
  if (!hasPermission(role, action)) {
    throw new PermissionError(`Role ${role} does not have permission: ${action}`);
  }
}

/**
 * Get all permissions for a role.
 */
export function getPermissions(role: string): PermissionAction[] {
  const normalized = mapLegacyRole(role);
  const perms = PERMISSION_MATRIX[normalized];
  return perms ? Array.from(perms) : [];
}

export class PermissionError extends Error {
  public readonly code = "FORBIDDEN";
  public readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = "PermissionError";
  }
}
