/**
 * Plan entitlement enforcement — the half of Phase 29 that was scaffolded and
 * never wired. plan-engine.ts answers "does this TIER include the feature";
 * this module answers it for a real organization, and is the one place API
 * routes should ask. Without a caller, every tier gets every feature and
 * there is nothing to upgrade to.
 */

import { getReadOnlyStatuses, hasFeature } from "@/lib/commercial/plan-engine";
import { getSubscription, type ProductLine } from "@/lib/commercial/subscriptions";
import type { PlanFeature, PlanTier } from "@/types/commercial";

export interface FeatureAccess {
  allowed: boolean;
  plan: PlanTier;
  feature: PlanFeature;
  productLine: ProductLine;
}

/**
 * Whether an organization's plan currently includes a feature.
 *
 * PER PRODUCT LINE. `productLine` defaults to WORKBENCH, which resolves from
 * the Organization columns exactly as before — existing behavior is unchanged.
 * COREEDGE/APTUS resolve from the Subscription table, and an organization with
 * no subscription for that line gets `allowed: false` with plan NONE: an
 * assessment limit must never gate a CoreEdge org, and a Workbench plan must
 * never silently grant CoreEdge features.
 *
 * Internal test deployments (INTERNAL_TEST_DEPLOYMENT=true) are exempt,
 * mirroring checkAssessmentLimit — never true on a customer-facing deploy.
 */
export async function checkFeatureAccess(
  organizationId: string,
  feature: PlanFeature,
  productLine: ProductLine = "WORKBENCH",
): Promise<FeatureAccess> {
  const subscription = await getSubscription(organizationId, productLine);
  const plan = subscription.plan as PlanTier;

  if (process.env.INTERNAL_TEST_DEPLOYMENT === "true") {
    return { allowed: true, plan, feature, productLine };
  }

  if (subscription.source === "none") {
    return { allowed: false, plan, feature, productLine };
  }

  return { allowed: hasFeature(plan, feature), plan, feature, productLine };
}

/**
 * Whether a subscription status puts the organization into read-only mode.
 * The portal layout already renders a banner for non-ACTIVE statuses; write
 * routes are expected to refuse with 403 when this returns true.
 */
export function isOrgReadOnly(subscriptionStatus: string): boolean {
  return (getReadOnlyStatuses() as string[]).includes(subscriptionStatus);
}
