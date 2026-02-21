/** Phase 29: Plan engine — pure functions, no DB access */

import {
  PLAN_LIMITS,
  SUBSCRIPTION_TRANSITIONS,
  type PlanTier,
  type PlanFeature,
  type PlanLimits,
  type SubscriptionStatus,
} from "@/types/commercial";

/**
 * Check if a given plan tier includes a specific feature.
 */
export function hasFeature(plan: PlanTier, feature: PlanFeature): boolean {
  const limits = PLAN_LIMITS[plan];
  return limits.features.includes(feature);
}

/**
 * Check if a subscription status transition is valid.
 */
export function canTransitionSubscription(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  const allowed = SUBSCRIPTION_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Generate a URL-safe slug from a company name.
 * Lowercase, non-alphanumeric replaced with hyphens, trimmed, max 50 chars.
 */
export function generateSlug(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * Check if a subscription status means the org is active.
 */
export function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return status === "TRIALING" || status === "ACTIVE";
}

/**
 * Return statuses that put the org into read-only mode.
 */
export function getReadOnlyStatuses(): SubscriptionStatus[] {
  return ["TRIAL_EXPIRED", "CANCELED"];
}

/**
 * Get plan limits for a given tier.
 */
export function getPlanLimits(plan: PlanTier): PlanLimits {
  return PLAN_LIMITS[plan];
}
