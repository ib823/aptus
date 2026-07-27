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
 * Where each role lands when onboarding finishes.
 *
 * A RECORD RATHER THAN A SWITCH, DELIBERATELY. This was a `switch (role)` whose
 * final arm was `case "viewer": default:` — and a `default` makes a switch over
 * a union look exhaustive to a reader while telling the compiler it need not be.
 * `support` was added to `UserRole`, the switch was never touched, and the
 * persona fell through to `/dashboard` while its own onboarding flow
 * (`ONBOARDING_FLOWS.support`) sent it to `/operations`. Onboarding told a
 * support user where to go and then took them somewhere else.
 *
 * `satisfies Record<UserRole, string>` is what stops that recurring: the next
 * role added to the union fails to compile here until someone decides where it
 * belongs. There is no `default` to absorb it.
 */
const POST_ONBOARDING_HOME = {
  platform_admin: "/admin",
  partner_lead: "/dashboard",
  project_manager: "/dashboard",
  executive_sponsor: "/dashboard",
  client_admin: "/dashboard",
  consultant: "/dashboard",
  solution_architect: "/dashboard",
  process_owner: "/dashboard",
  it_lead: "/dashboard",
  data_migration_lead: "/dashboard",
  viewer: "/dashboard",
  // Matches the destination this persona's own onboarding flow points at.
  support: "/operations",
} as const satisfies Record<UserRole, string>;

/**
 * Roles whose onboarding can hand them straight into the assessment they were
 * invited to work on, when there is one. Everyone else lands on their home
 * above regardless of context.
 */
const RESUMES_INTO_ASSESSMENT: ReadonlySet<UserRole> = new Set<UserRole>([
  "consultant",
  "solution_architect",
  "process_owner",
  "it_lead",
  "data_migration_lead",
]);

/**
 * Get the post-onboarding redirect URL for a role.
 */
export function getPostOnboardingRedirect(
  role: UserRole,
  context?: { assessmentId?: string | undefined } | undefined,
): string {
  if (context?.assessmentId && RESUMES_INTO_ASSESSMENT.has(role)) {
    return `/assessments/${context.assessmentId}`;
  }
  // A role outside the union can still arrive from a database string; land it
  // on the viewer's home rather than `undefined`.
  return POST_ONBOARDING_HOME[role] ?? POST_ONBOARDING_HOME.viewer;
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
