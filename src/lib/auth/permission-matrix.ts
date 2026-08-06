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

/**
 * Permission sets for each role.
 *
 * RECONCILED WITH ROLE_CAPABILITIES (lib/auth/role-permissions), which is the
 * matrix most guards actually enforce. The two grew independently and
 * contradicted each other on most roles — partner_lead held every register
 * and sign-off action here while the capabilities file denied all of them;
 * executive_sponsor could transition an assessment on one path and not the
 * other. Two authorization sources that disagree means the answer depends on
 * which door you knock on. Where both speak to the same question the
 * CAPABILITIES file won (it is the enforced one), and
 * tests/unit/auth/permission-source-reconciliation.test.ts fails the build on
 * the next divergence. Actions with no capability axis (scope, notes,
 * workshops, reports, profile) keep their original grants.
 */
export const PERMISSION_MATRIX: Record<UserRole, Set<PermissionAction>> = {
  platform_admin: new Set(ALL_ACTIONS),

  partner_lead: new Set([
    "assessment.create", "assessment.view", "assessment.edit", "assessment.delete", "assessment.transition",
    "profile.edit", "scope.edit", "scope.bulkSelect",
    "step.addNote",
    "org.manage",
    "user.invite", "user.deactivate", "user.changeRole",
    "report.view", "report.export",
    "workshop.create", "workshop.facilitate",
  ]),

  consultant: new Set([
    "assessment.create", "assessment.view", "assessment.edit", "assessment.transition",
    "profile.edit", "scope.edit", "scope.bulkSelect",
    "step.classify", "step.addNote",
    "gap.create", "gap.edit", "gap.approve", "gap.addAlternative",
    "integration.create", "integration.edit", "integration.approve",
    "dataMigration.create", "dataMigration.edit", "dataMigration.delete", "dataMigration.approve",
    "ocm.create", "ocm.edit", "ocm.delete", "ocm.approve",
    "report.view", "report.export",
    "signoff.execute",
    "workshop.create", "workshop.facilitate",
  ]),

  project_manager: new Set([
    "assessment.view",
    "scope.edit",
    "step.addNote",
    "report.view", "report.export",
    "workshop.create",
  ]),

  solution_architect: new Set([
    "assessment.view",
    "step.classify", "step.addNote",
    "gap.create", "gap.edit", "gap.addAlternative",
    "report.view", "report.export",
    "workshop.create", "workshop.facilitate",
  ]),

  process_owner: new Set([
    "assessment.view",
    "step.classify",
    "step.addNote",
    "report.view",
  ]),

  it_lead: new Set([
    "assessment.view",
    "step.classify", "step.addNote",
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
    "assessment.view", "assessment.transition",
    "report.view", "report.export",
    "signoff.execute",
  ]),

  viewer: new Set([
    "assessment.view",
    "report.view",
  ]),

  client_admin: new Set([
    "assessment.view",
    "org.manage",
    "user.invite", "user.deactivate",
    "report.view",
  ]),

  // Read-oriented operations. Deliberately NO governance mutation of any kind:
  // this persona watches the running system, it does not change what the system
  // is permitted to do.
  support: new Set([
    "assessment.view",
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
