/** Phase 24: Onboarding flow engine — pure functions for onboarding navigation */

import type { UserRole } from "@/types/assessment";
import type { OnboardingFlow } from "@/types/onboarding";
import { ONBOARDING_FLOWS } from "@/types/onboarding";

/**
 * Get the onboarding flow for a role.
 * Falls back to the viewer flow if the role is not found.
 */
export function getOnboardingFlow(role: UserRole): OnboardingFlow {
  return ONBOARDING_FLOWS[role] ?? ONBOARDING_FLOWS.viewer;
}

/**
 * Get the post-onboarding redirect URL for a role.
 */
export function getPostOnboardingRedirect(
  role: UserRole,
  context?: { assessmentId?: string | undefined } | undefined,
): string {
  switch (role) {
    case "platform_admin":
      return "/admin";
    case "partner_lead":
    case "project_manager":
    case "executive_sponsor":
    case "client_admin":
      return "/dashboard";
    case "consultant":
    case "solution_architect":
    case "process_owner":
    case "it_lead":
    case "data_migration_lead":
      if (context?.assessmentId) {
        return `/assessments/${context.assessmentId}`;
      }
      return "/dashboard";
    case "viewer":
    default:
      return "/dashboard";
  }
}

/**
 * Check if a step can be skipped.
 */
export function canSkipStep(step: { isRequired: boolean }): boolean {
  return !step.isRequired;
}

/**
 * Get the next step index to complete, or null if all steps are done.
 * Skips already completed and skipped steps.
 */
export function getNextStep(
  flow: OnboardingFlow,
  completedSteps: number[],
  skippedSteps: number[],
  currentStep: number,
): number | null {
  const doneSet = new Set([...completedSteps, ...skippedSteps]);

  // First try to find a step after the current one
  for (let i = currentStep + 1; i < flow.steps.length; i++) {
    if (!doneSet.has(i)) {
      return i;
    }
  }

  // Then check if there are any earlier steps that were missed
  for (let i = 0; i <= currentStep; i++) {
    if (!doneSet.has(i)) {
      return i;
    }
  }

  return null;
}
