/** Area-locked permissions middleware */

import { prisma } from "@/lib/db/prisma";
import type { SessionUser, UserRole } from "@/types/assessment";
import { PROFILE_COMPLETENESS_GATE } from "@/types/assessment";
import { calculateProfileCompleteness } from "@/lib/assessment/profile-completeness";
import { ERROR_CODES } from "@/types/api";
import { mapLegacyRole } from "@/lib/auth/role-migration";
// ROLE_CAPABILITIES from "@/lib/auth/role-permissions" available for future capability checks

export interface PermissionResult {
  allowed: boolean;
  code?: string;
  message?: string;
}

/**
 * Check if a user has a specific role.
 * Supports legacy role names via mapLegacyRole.
 */
export function hasRole(user: SessionUser, roles: UserRole[]): boolean {
  const mapped = mapLegacyRole(user.role);
  return roles.includes(mapped);
}

/**
 * Normalize a user role to the new 11-role system.
 */
function normalizeRole(role: string): UserRole {
  return mapLegacyRole(role);
}

/**
 * Check if a user can edit a step response for a given scope item.
 * Phase 17 expanded roles:
 *   - platform_admin, consultant: full edit access (consultants require stakeholder + area check)
 *   - solution_architect: can add notes across areas
 *   - process_owner: area-locked edit access
 *   - it_lead: can add notes but not change fitStatus
 *   - project_manager, data_migration_lead, viewer, client_admin: no edit access
 *   - executive_sponsor: read-only
 *   - partner_lead: read-only (no direct step editing)
 */
export async function canEditStepResponse(
  user: SessionUser,
  assessmentId: string,
  scopeItemFunctionalArea: string,
  overrideReason?: string,
): Promise<PermissionResult> {
  const role = normalizeRole(user.role);

  if (role === "platform_admin") {
    return { allowed: true };
  }

  // Roles that cannot edit step responses at all
  const readOnlyRoles: UserRole[] = [
    "executive_sponsor", "viewer", "data_migration_lead",
    "client_admin", "project_manager", "partner_lead",
  ];
  if (readOnlyRoles.includes(role)) {
    return {
      allowed: false,
      code: ERROR_CODES.FORBIDDEN,
      message: "Your role does not have permission to edit step responses",
    };
  }

  if (role === "consultant") {
    const stakeholder = await getStakeholder(user.id, assessmentId);
    if (!stakeholder) {
      return {
        allowed: false,
        code: ERROR_CODES.FORBIDDEN,
        message: "You are not a stakeholder in this assessment",
      };
    }

    const isInArea = stakeholder.assignedAreas.length === 0 ||
      stakeholder.assignedAreas.includes(scopeItemFunctionalArea);

    if (!isInArea && !overrideReason) {
      return {
        allowed: false,
        code: ERROR_CODES.AREA_LOCKED,
        message: "Cross-area edit requires a reason",
      };
    }

    return { allowed: true };
  }

  if (role === "solution_architect") {
    const stakeholder = await getStakeholder(user.id, assessmentId);
    if (!stakeholder) {
      return {
        allowed: false,
        code: ERROR_CODES.FORBIDDEN,
        message: "You are not a stakeholder in this assessment",
      };
    }
    // Solution architects can add notes across areas
    return { allowed: true };
  }

  if (role === "it_lead") {
    // IT leads can add notes but NOT change fitStatus
    // This is enforced at the API handler level, not here
    return { allowed: true };
  }

  if (role === "process_owner") {
    const stakeholder = await getStakeholder(user.id, assessmentId);
    if (!stakeholder) {
      return {
        allowed: false,
        code: ERROR_CODES.FORBIDDEN,
        message: "You are not a stakeholder in this assessment",
      };
    }

    if (!stakeholder.assignedAreas.includes(scopeItemFunctionalArea)) {
      return {
        allowed: false,
        code: ERROR_CODES.AREA_LOCKED,
        message: "You don't have permission to edit this area",
      };
    }

    return { allowed: true };
  }

  return {
    allowed: false,
    code: ERROR_CODES.FORBIDDEN,
    message: "Unknown role",
  };
}

/**
 * Check if a user can edit a scope selection.
 */
export async function canEditScopeSelection(
  user: SessionUser,
  assessmentId: string,
  scopeItemFunctionalArea: string,
): Promise<PermissionResult> {
  const role = normalizeRole(user.role);

  if (role === "platform_admin" || role === "consultant") {
    return { allowed: true };
  }

  // Roles that cannot edit scope
  const noScopeEdit: UserRole[] = [
    "executive_sponsor", "it_lead", "viewer", "data_migration_lead",
    "client_admin", "project_manager", "partner_lead", "solution_architect",
  ];
  if (noScopeEdit.includes(role)) {
    return {
      allowed: false,
      code: ERROR_CODES.FORBIDDEN,
      message: "You don't have permission to edit scope selections",
    };
  }

  if (role === "process_owner") {
    const stakeholder = await getStakeholder(user.id, assessmentId);
    if (!stakeholder) {
      return {
        allowed: false,
        code: ERROR_CODES.FORBIDDEN,
        message: "You are not a stakeholder in this assessment",
      };
    }

    if (!stakeholder.assignedAreas.includes(scopeItemFunctionalArea)) {
      return {
        allowed: false,
        code: ERROR_CODES.AREA_LOCKED,
        message: "You don't have permission to edit this area",
      };
    }

    return { allowed: true };
  }

  return {
    allowed: false,
    code: ERROR_CODES.FORBIDDEN,
    message: "Unknown role",
  };
}

/**
 * Check if a user can manage stakeholders.
 */
export function canManageStakeholders(user: SessionUser): PermissionResult {
  const role = normalizeRole(user.role);

  if (hasRole(user, ["platform_admin" as UserRole, "partner_lead" as UserRole, "consultant" as UserRole, "project_manager" as UserRole])) {
    return { allowed: true };
  }

  // Backward compat: "admin" maps to platform_admin via hasRole
  if (role === "platform_admin" || role === "partner_lead" || role === "consultant" || role === "project_manager") {
    return { allowed: true };
  }

  return {
    allowed: false,
    code: ERROR_CODES.FORBIDDEN,
    message: "Only platform admins, partner leads, consultants, and project managers can manage stakeholders",
  };
}

/**
 * Check if a user can edit a register (integration, data migration, OCM).
 */
export function canEditRegister(
  user: SessionUser,
  _assessmentId: string,
  registerType: "integration" | "data_migration" | "ocm",
): PermissionResult {
  const role = normalizeRole(user.role);

  if (role === "platform_admin" || role === "consultant") {
    return { allowed: true };
  }

  if (registerType === "integration") {
    if (role === "it_lead") return { allowed: true };
  }

  if (registerType === "data_migration") {
    if (role === "it_lead" || role === "data_migration_lead") return { allowed: true };
  }

  if (registerType === "ocm") {
    if (role === "project_manager" || role === "process_owner") return { allowed: true };
  }

  return {
    allowed: false,
    code: ERROR_CODES.FORBIDDEN,
    message: `Your role does not have permission to edit the ${registerType} register`,
  };
}

/**
 * Check if a user can transition an assessment to a new status.
 * Supports both V1 (5-status) and V2 (10-status) transitions.
 * Phase 10: draft->in_progress requires profile completeness >= 60%
 * Phase 13: in_progress->completed requires all gaps to have clientApproved = true
 */
export async function canTransitionStatus(
  user: SessionUser,
  fromStatus: string,
  toStatus: string,
  assessmentId?: string,
): Promise<PermissionResult> {
  const role = normalizeRole(user.role);
  const transitionKey = `${fromStatus}->${toStatus}`;

  // V1 transitions (backward compatibility)
  const v1Roles: Record<string, UserRole[]> = {
    "draft->in_progress": ["consultant", "platform_admin"],
    "in_progress->completed": ["consultant", "platform_admin"],
    "completed->reviewed": ["consultant", "platform_admin"],
    "reviewed->signed_off": ["consultant", "platform_admin", "executive_sponsor"],
  };

  // V2 transitions (Phase 18)
  const v2Roles: Record<string, UserRole[]> = {
    "draft->scoping": ["platform_admin", "partner_lead", "consultant"],
    "scoping->in_progress": ["platform_admin", "partner_lead", "consultant"],
    "scoping->draft": ["platform_admin", "partner_lead", "consultant"],
    "in_progress->workshop_active": ["platform_admin", "consultant", "solution_architect"],
    "in_progress->review_cycle": ["platform_admin", "consultant"],
    "in_progress->gap_resolution": ["platform_admin", "consultant"],
    "in_progress->scoping": ["platform_admin", "partner_lead"],
    "workshop_active->in_progress": ["platform_admin", "consultant", "solution_architect"],
    "review_cycle->in_progress": ["platform_admin", "consultant"],
    "gap_resolution->pending_validation": ["platform_admin", "consultant"],
    "gap_resolution->in_progress": ["platform_admin", "consultant"],
    "pending_validation->validated": ["platform_admin", "consultant", "partner_lead"],
    "pending_validation->gap_resolution": ["platform_admin", "consultant"],
    "validated->pending_sign_off": ["platform_admin", "consultant", "partner_lead"],
    "pending_sign_off->signed_off": ["platform_admin", "executive_sponsor", "partner_lead"],
    "pending_sign_off->validated": ["platform_admin", "partner_lead"],
    "signed_off->handed_off": ["platform_admin", "partner_lead"],
    "signed_off->archived": ["platform_admin"],
    "handed_off->archived": ["platform_admin"],
  };

  // Merge both transition maps; V2 takes precedence
  const allRoles = { ...v1Roles, ...v2Roles };
  const allowedRoles = allRoles[transitionKey];

  if (!allowedRoles) {
    return {
      allowed: false,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `Invalid status transition: ${fromStatus} -> ${toStatus}`,
    };
  }

  if (!allowedRoles.includes(role)) {
    return {
      allowed: false,
      code: ERROR_CODES.FORBIDDEN,
      message: `Role ${role} cannot perform this transition`,
    };
  }

  // Phase 10: Profile completeness gate for draft -> in_progress
  if (transitionKey === "draft->in_progress" && assessmentId) {
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        companyName: true,
        industry: true,
        country: true,
        companySize: true,
        employeeCount: true,
        annualRevenue: true,
        deploymentModel: true,
        sapModules: true,
        migrationApproach: true,
        targetGoLiveDate: true,
        keyProcesses: true,
        operatingCountries: true,
        currentErpVersion: true,
        itLandscapeSummary: true,
      },
    });

    if (assessment) {
      const { score } = calculateProfileCompleteness(assessment);
      if (score < PROFILE_COMPLETENESS_GATE) {
        return {
          allowed: false,
          code: ERROR_CODES.VALIDATION_ERROR,
          message: `Profile completeness is ${score}% — minimum ${PROFILE_COMPLETENESS_GATE}% required to proceed`,
        };
      }
    }
  }

  // Phase 13: All gaps must be approved for in_progress -> completed
  if (transitionKey === "in_progress->completed" && assessmentId) {
    const unapprovedGaps = await prisma.gapResolution.count({
      where: {
        assessmentId,
        clientApproved: false,
      },
    });

    if (unapprovedGaps > 0) {
      return {
        allowed: false,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `${unapprovedGaps} gap resolution(s) still need client approval`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if MFA is required for a user's role but not yet verified.
 * Updated for 11-role system.
 */
export function isMfaRequired(user: SessionUser): boolean {
  const role = normalizeRole(user.role);

  // Roles that require MFA by default (external / client-facing)
  const mfaRequiredRoles: UserRole[] = [
    "process_owner", "it_lead", "data_migration_lead",
    "executive_sponsor", "project_manager", "viewer", "client_admin",
  ];

  if (mfaRequiredRoles.includes(role)) {
    return !user.mfaVerified;
  }

  // Internal roles: MFA required only if they've enabled it
  return user.mfaEnabled && !user.mfaVerified;
}

/**
 * Check if a user role is an admin-level role (can access admin panel).
 */
export function isAdminRole(role: string): boolean {
  const mapped = normalizeRole(role);
  return mapped === "platform_admin";
}

/**
 * Get stakeholder record for a user in an assessment.
 */
async function getStakeholder(userId: string, assessmentId: string) {
  return prisma.assessmentStakeholder.findFirst({
    where: {
      userId,
      assessmentId,
    },
    select: {
      assignedAreas: true,
      canEdit: true,
      role: true,
    },
  });
}
