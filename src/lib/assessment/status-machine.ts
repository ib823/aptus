/** Phase 18: Assessment status machine — 10-status lifecycle */

import type { AssessmentStatusV2, AssessmentPhase, UserRole } from "@/types/assessment";
import { mapLegacyRole } from "@/lib/auth/role-migration";

/** Ordered list of all V2 assessment statuses */
export const ASSESSMENT_STATUSES_V2: AssessmentStatusV2[] = [
  "draft",
  "scoping",
  "in_progress",
  "workshop_active",
  "review_cycle",
  "gap_resolution",
  "pending_validation",
  "validated",
  "pending_sign_off",
  "signed_off",
  "handed_off",
  "archived",
];

/** Valid from->to transitions */
export const VALID_TRANSITIONS_V2: Record<AssessmentStatusV2, AssessmentStatusV2[]> = {
  draft: ["scoping"],
  scoping: ["in_progress", "draft"],
  in_progress: ["workshop_active", "review_cycle", "gap_resolution", "scoping"],
  workshop_active: ["in_progress"],
  review_cycle: ["in_progress"],
  gap_resolution: ["pending_validation", "in_progress"],
  pending_validation: ["validated", "gap_resolution"],
  validated: ["pending_sign_off"],
  pending_sign_off: ["signed_off", "validated"],
  signed_off: ["handed_off", "archived"],
  handed_off: ["archived"],
  archived: [],
};

/** Which roles can trigger each transition */
export const TRANSITION_ROLES_V2: Record<string, UserRole[]> = {
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

/** V1 to V2 status mapping for backward compatibility */
export const V1_TO_V2_STATUS_MAP: Record<string, AssessmentStatusV2> = {
  draft: "draft",
  in_progress: "in_progress",
  completed: "pending_validation",
  reviewed: "validated",
  signed_off: "signed_off",
};

/** Phase prerequisites -- which phases must be completed before starting another */
export const PHASE_PREREQUISITES: Record<AssessmentPhase, AssessmentPhase[]> = {
  scoping: [],
  process_review: ["scoping"],
  gap_resolution: ["process_review"],
  integration: ["scoping"],
  data_migration: ["scoping"],
  ocm: ["scoping"],
  validation: ["process_review", "gap_resolution"],
  sign_off: ["validation"],
};

export interface TransitionResult {
  allowed: boolean;
  reason?: string | undefined;
}

/**
 * Check if a status transition is allowed.
 * Pure function with optional phase gating logic.
 */
export function canTransition(
  fromStatus: string,
  toStatus: string,
  userRole: string,
): TransitionResult {
  const from = fromStatus as AssessmentStatusV2;
  const to = toStatus as AssessmentStatusV2;
  const role = mapLegacyRole(userRole);

  // Check if the transition is valid
  const validTargets = VALID_TRANSITIONS_V2[from];
  if (!validTargets || !validTargets.includes(to)) {
    return {
      allowed: false,
      reason: `Invalid transition: ${from} -> ${to}. Valid targets: ${validTargets?.join(", ") ?? "none"}`,
    };
  }

  // Check if the role can trigger this transition
  const transitionKey = `${from}->${to}`;
  const allowedRoles = TRANSITION_ROLES_V2[transitionKey];
  if (!allowedRoles || !allowedRoles.includes(role)) {
    return {
      allowed: false,
      reason: `Role ${role} cannot perform transition ${from} -> ${to}`,
    };
  }

  return { allowed: true };
}

/**
 * Get available transitions for a user's current status and role.
 */
export function getAvailableTransitions(
  currentStatus: string,
  userRole: string,
): AssessmentStatusV2[] {
  const status = currentStatus as AssessmentStatusV2;
  const role = mapLegacyRole(userRole);
  const validTargets = VALID_TRANSITIONS_V2[status] ?? [];

  return validTargets.filter((target) => {
    const key = `${status}->${target}`;
    const allowedRoles = TRANSITION_ROLES_V2[key];
    return allowedRoles?.includes(role) ?? false;
  });
}

/** Status display labels */
export const STATUS_LABELS: Record<AssessmentStatusV2, string> = {
  draft: "Draft",
  scoping: "Scoping",
  in_progress: "In Progress",
  workshop_active: "Workshop Active",
  review_cycle: "Review Cycle",
  gap_resolution: "Gap Resolution",
  pending_validation: "Pending Validation",
  validated: "Validated",
  pending_sign_off: "Pending Sign-Off",
  signed_off: "Signed Off",
  handed_off: "Handed Off",
  archived: "Archived",
};

/** Status color mapping for UI badges */
export const STATUS_COLORS: Record<AssessmentStatusV2, string> = {
  draft: "gray",
  scoping: "blue",
  in_progress: "indigo",
  workshop_active: "purple",
  review_cycle: "amber",
  gap_resolution: "orange",
  pending_validation: "yellow",
  validated: "lime",
  pending_sign_off: "cyan",
  signed_off: "green",
  handed_off: "teal",
  archived: "slate",
};
