/** Phase 17: Role capability matrix — defines what each role can do */

import type { UserRole } from "@/types/assessment";
import { ROLE_HIERARCHY } from "@/types/assessment";
import { mapLegacyRole } from "@/lib/auth/role-migration";

export interface RoleCapabilities {
  canCreateAssessment: boolean;
  canEditAssessment: boolean;
  canDeleteAssessment: boolean;
  canManageStakeholders: boolean;
  canManageOrganization: boolean;
  canInviteUsers: boolean;
  canTransitionStatus: boolean;
  canEditStepResponses: boolean;
  canEditGapResolutions: boolean;
  canEditRegisters: boolean;
  canApproveGaps: boolean;
  canSignOff: boolean;
  canViewAllAssessments: boolean;
  isAreaLocked: boolean;
}

/** Role capability matrix */
export const ROLE_CAPABILITIES: Record<UserRole, RoleCapabilities> = {
  platform_admin: {
    canCreateAssessment: true,
    canEditAssessment: true,
    canDeleteAssessment: true,
    canManageStakeholders: true,
    canManageOrganization: true,
    canInviteUsers: true,
    canTransitionStatus: true,
    canEditStepResponses: true,
    canEditGapResolutions: true,
    canEditRegisters: true,
    canApproveGaps: true,
    canSignOff: true,
    canViewAllAssessments: true,
    isAreaLocked: false,
  },
  partner_lead: {
    canCreateAssessment: true,
    canEditAssessment: true,
    canDeleteAssessment: true,
    canManageStakeholders: true,
    canManageOrganization: true,
    canInviteUsers: true,
    canTransitionStatus: true,
    canEditStepResponses: false,
    canEditGapResolutions: false,
    canEditRegisters: false,
    canApproveGaps: false,
    canSignOff: false,
    canViewAllAssessments: true,
    isAreaLocked: false,
  },
  consultant: {
    canCreateAssessment: true,
    canEditAssessment: true,
    canDeleteAssessment: false,
    canManageStakeholders: true,
    canManageOrganization: false,
    canInviteUsers: false,
    canTransitionStatus: true,
    canEditStepResponses: true,
    canEditGapResolutions: true,
    canEditRegisters: true,
    canApproveGaps: true,
    canSignOff: true,
    canViewAllAssessments: false,
    isAreaLocked: false,
  },
  project_manager: {
    canCreateAssessment: false,
    canEditAssessment: false,
    canDeleteAssessment: false,
    canManageStakeholders: true,
    canManageOrganization: false,
    canInviteUsers: false,
    canTransitionStatus: false,
    canEditStepResponses: false,
    canEditGapResolutions: false,
    canEditRegisters: false,
    canApproveGaps: false,
    canSignOff: false,
    canViewAllAssessments: false,
    isAreaLocked: false,
  },
  solution_architect: {
    canCreateAssessment: false,
    canEditAssessment: false,
    canDeleteAssessment: false,
    canManageStakeholders: false,
    canManageOrganization: false,
    canInviteUsers: false,
    canTransitionStatus: false,
    canEditStepResponses: true,
    canEditGapResolutions: true,
    canEditRegisters: false,
    canApproveGaps: false,
    canSignOff: false,
    canViewAllAssessments: false,
    isAreaLocked: false,
  },
  process_owner: {
    canCreateAssessment: false,
    canEditAssessment: false,
    canDeleteAssessment: false,
    canManageStakeholders: false,
    canManageOrganization: false,
    canInviteUsers: false,
    canTransitionStatus: false,
    canEditStepResponses: true,
    canEditGapResolutions: false,
    canEditRegisters: false,
    canApproveGaps: false,
    canSignOff: false,
    canViewAllAssessments: false,
    isAreaLocked: true,
  },
  it_lead: {
    canCreateAssessment: false,
    canEditAssessment: false,
    canDeleteAssessment: false,
    canManageStakeholders: false,
    canManageOrganization: false,
    canInviteUsers: false,
    canTransitionStatus: false,
    canEditStepResponses: true,
    canEditGapResolutions: false,
    canEditRegisters: true,
    canApproveGaps: false,
    canSignOff: false,
    canViewAllAssessments: false,
    isAreaLocked: false,
  },
  data_migration_lead: {
    canCreateAssessment: false,
    canEditAssessment: false,
    canDeleteAssessment: false,
    canManageStakeholders: false,
    canManageOrganization: false,
    canInviteUsers: false,
    canTransitionStatus: false,
    canEditStepResponses: false,
    canEditGapResolutions: false,
    canEditRegisters: true,
    canApproveGaps: false,
    canSignOff: false,
    canViewAllAssessments: false,
    isAreaLocked: false,
  },
  executive_sponsor: {
    canCreateAssessment: false,
    canEditAssessment: false,
    canDeleteAssessment: false,
    canManageStakeholders: false,
    canManageOrganization: false,
    canInviteUsers: false,
    canTransitionStatus: true,
    canEditStepResponses: false,
    canEditGapResolutions: false,
    canEditRegisters: false,
    canApproveGaps: false,
    canSignOff: true,
    canViewAllAssessments: false,
    isAreaLocked: false,
  },
  viewer: {
    canCreateAssessment: false,
    canEditAssessment: false,
    canDeleteAssessment: false,
    canManageStakeholders: false,
    canManageOrganization: false,
    canInviteUsers: false,
    canTransitionStatus: false,
    canEditStepResponses: false,
    canEditGapResolutions: false,
    canEditRegisters: false,
    canApproveGaps: false,
    canSignOff: false,
    canViewAllAssessments: false,
    isAreaLocked: false,
  },
  client_admin: {
    canCreateAssessment: false,
    canEditAssessment: false,
    canDeleteAssessment: false,
    canManageStakeholders: false,
    canManageOrganization: true,
    canInviteUsers: true,
    canTransitionStatus: false,
    canEditStepResponses: false,
    canEditGapResolutions: false,
    canEditRegisters: false,
    canApproveGaps: false,
    canSignOff: false,
    canViewAllAssessments: false,
    isAreaLocked: false,
  },
};

/**
 * Get capabilities for a role, supporting legacy role names.
 */
export function getCapabilities(role: string): RoleCapabilities {
  const mapped = mapLegacyRole(role);
  return ROLE_CAPABILITIES[mapped] ?? ROLE_CAPABILITIES.viewer;
}

/**
 * Check if a user's role can manage another role (privilege escalation prevention).
 * A user can only assign roles that are at or below their own hierarchy level.
 */
export function canAssignRole(managerRole: string, targetRole: string): boolean {
  const managerMapped = mapLegacyRole(managerRole);
  const targetMapped = mapLegacyRole(targetRole);

  const managerLevel = ROLE_HIERARCHY[managerMapped] ?? 0;
  const targetLevel = ROLE_HIERARCHY[targetMapped] ?? 0;

  return managerLevel >= targetLevel;
}

/**
 * Get all valid UserRole values.
 */
export const ALL_ROLES: UserRole[] = [
  "platform_admin",
  "partner_lead",
  "consultant",
  "project_manager",
  "solution_architect",
  "process_owner",
  "it_lead",
  "data_migration_lead",
  "executive_sponsor",
  "viewer",
  "client_admin",
];
