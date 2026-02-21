/** Sign-off process state machine — pure functions, no DB dependencies */

import type { SignOffStatus } from "@/types/signoff";
import { SIGNOFF_TRANSITIONS } from "@/types/signoff";

/**
 * Check if a transition from current to target status is valid.
 */
export function canTransitionSignOff(
  current: SignOffStatus,
  target: SignOffStatus,
): boolean {
  const validTargets = SIGNOFF_TRANSITIONS[current];
  if (!validTargets) return false;
  return validTargets.includes(target);
}

/**
 * Get all valid next statuses from the current status.
 */
export function getAvailableTransitions(current: SignOffStatus): SignOffStatus[] {
  return SIGNOFF_TRANSITIONS[current] ?? [];
}

/**
 * Check if a status is terminal (no further transitions possible).
 */
export function isTerminalState(status: SignOffStatus): boolean {
  const transitions = SIGNOFF_TRANSITIONS[status];
  return !transitions || transitions.length === 0;
}

/**
 * Get the role required to act at a given sign-off status.
 * Returns null if no specific role is required (e.g., terminal states).
 */
export function getRequiredRole(status: SignOffStatus): string | null {
  const roleMap: Record<SignOffStatus, string | null> = {
    VALIDATION_NOT_STARTED: "consultant",
    AREA_VALIDATION_IN_PROGRESS: "process_owner",
    AREA_VALIDATION_COMPLETE: "consultant",
    TECHNICAL_VALIDATION_IN_PROGRESS: "it_lead",
    TECHNICAL_VALIDATION_COMPLETE: "consultant",
    CROSS_FUNCTIONAL_VALIDATION_IN_PROGRESS: "solution_architect",
    CROSS_FUNCTIONAL_VALIDATION_COMPLETE: "consultant",
    EXECUTIVE_SIGN_OFF_PENDING: "executive_sponsor",
    EXECUTIVE_SIGNED: "partner_lead",
    PARTNER_COUNTERSIGN_PENDING: "partner_lead",
    COMPLETED: null,
    REJECTED: null,
  };
  return roleMap[status] ?? null;
}
