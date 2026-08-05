/**
 * Plan entitlement enforcement — the half of Phase 29 that was scaffolded and
 * never wired. plan-engine.ts answers "does this TIER include the feature";
 * this module answers it for a real organization, and is the one place API
 * routes should ask. Without a caller, every tier gets every feature and
 * there is nothing to upgrade to.
 */

import { prisma } from "@/lib/db/prisma";
import { getReadOnlyStatuses, hasFeature } from "@/lib/commercial/plan-engine";
import type { PlanFeature, PlanTier } from "@/types/commercial";

export interface FeatureAccess {
  allowed: boolean;
  plan: PlanTier;
  feature: PlanFeature;
}

/**
 * Whether an organization's plan currently includes a feature.
 *
 * Internal test deployments (INTERNAL_TEST_DEPLOYMENT=true) are exempt,
 * mirroring checkAssessmentLimit — never true on a customer-facing deploy.
 */
export async function checkFeatureAccess(
  organizationId: string,
  feature: PlanFeature,
): Promise<FeatureAccess> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { plan: true },
  });
  const plan = org.plan as PlanTier;

  if (process.env.INTERNAL_TEST_DEPLOYMENT === "true") {
    return { allowed: true, plan, feature };
  }

  return { allowed: hasFeature(plan, feature), plan, feature };
}

/**
 * Whether a subscription status puts the organization into read-only mode.
 * The portal layout already renders a banner for non-ACTIVE statuses; write
 * routes are expected to refuse with 403 when this returns true.
 */
export function isOrgReadOnly(subscriptionStatus: string): boolean {
  return (getReadOnlyStatuses() as string[]).includes(subscriptionStatus);
}
