/** Area-locked permissions middleware */

import { prisma } from "@/lib/db/prisma";
import type { SessionUser, UserRole } from "@/types/assessment";
import { PROFILE_COMPLETENESS_GATE } from "@/types/assessment";
import { calculateProfileCompleteness } from "@/lib/assessment/profile-completeness";
import { ERROR_CODES } from "@/types/api";

export interface PermissionResult {
  allowed: boolean;
  code?: string;
  message?: string;
}

/**
 * Check if a user has a specific role.
 */
export function hasRole(user: SessionUser, roles: UserRole[]): boolean {
  return roles.includes(user.role);
}

/**
 * Check if a user can edit a step response for a given scope item.
 * Process owners can only edit within their assigned areas.
 * IT leads can only add notes, not change fitStatus.
 * Executives cannot edit at all.
 * Consultants and admins can edit anything.
 */
export async function canEditStepResponse(
  user: SessionUser,
  assessmentId: string,
  scopeItemFunctionalArea: string,
  overrideReason?: string,
): Promise<PermissionResult> {
  if (user.role === "admin") {
    return { allowed: true };
  }

  if (user.role === "executive") {
    return {
      allowed: false,
      code: ERROR_CODES.FORBIDDEN,
      message: "Executives have read-only access",
    };
  }

  if (user.role === "consultant") {
    // Consultants can always edit, but cross-area edits require a reason
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

  if (user.role === "it_lead") {
    // IT leads can add notes but NOT change fitStatus
    // This is enforced at the API handler level, not here
    return { allowed: true };
  }

  if (user.role === "process_owner") {
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
  if (user.role === "admin" || user.role === "consultant") {
    return { allowed: true };
  }

  if (user.role === "executive" || user.role === "it_lead") {
    return {
      allowed: false,
      code: ERROR_CODES.FORBIDDEN,
      message: "You don't have permission to edit scope selections",
    };
  }

  if (user.role === "process_owner") {
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
  if (hasRole(user, ["consultant", "admin"])) {
    return { allowed: true };
  }

  return {
    allowed: false,
    code: ERROR_CODES.FORBIDDEN,
    message: "Only consultants and admins can manage stakeholders",
  };
}

/**
 * Check if a user can transition an assessment to a new status.
 * Phase 10: draft→in_progress requires profile completeness >= 60%
 * Phase 13: in_progress→completed requires all gaps to have clientApproved = true
 */
export async function canTransitionStatus(
  user: SessionUser,
  fromStatus: string,
  toStatus: string,
  assessmentId?: string,
): Promise<PermissionResult> {
  const transitionKey = `${fromStatus}->${toStatus}`;
  const allowedRoles: UserRole[] | undefined = {
    "draft->in_progress": ["consultant", "admin"] as UserRole[],
    "in_progress->completed": ["consultant", "admin"] as UserRole[],
    "completed->reviewed": ["consultant", "admin"] as UserRole[],
    "reviewed->signed_off": ["consultant", "admin", "executive"] as UserRole[],
  }[transitionKey];

  if (!allowedRoles) {
    return {
      allowed: false,
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `Invalid status transition: ${fromStatus} → ${toStatus}`,
    };
  }

  if (!allowedRoles.includes(user.role)) {
    return {
      allowed: false,
      code: ERROR_CODES.FORBIDDEN,
      message: `Role ${user.role} cannot perform this transition`,
    };
  }

  // Phase 10: Profile completeness gate for draft → in_progress
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

  // Phase 13: All gaps must be approved for in_progress → completed
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
 */
export function isMfaRequired(user: SessionUser): boolean {
  const externalRoles: UserRole[] = ["process_owner", "it_lead", "executive"];
  if (!externalRoles.includes(user.role)) {
    // Internal users: MFA required only if they've enabled it
    return user.mfaEnabled && !user.mfaVerified;
  }
  // External users: MFA is always required
  return !user.mfaVerified;
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
