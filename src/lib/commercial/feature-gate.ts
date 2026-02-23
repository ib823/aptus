/** Feature gating — checks plan features and subscription status */

import { prisma } from "@/lib/db/prisma";
import { hasFeature, isSubscriptionActive, getReadOnlyStatuses } from "@/lib/commercial/plan-engine";
import type { PlanTier, PlanFeature, SubscriptionStatus } from "@/types/commercial";

export interface FeatureCheckResult {
  allowed: boolean;
  reason?: string | undefined;
}

export async function checkFeatureAccess(
  organizationId: string,
  feature: PlanFeature,
): Promise<FeatureCheckResult> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true, subscriptionStatus: true },
  });

  if (!org) {
    return { allowed: false, reason: "Organization not found" };
  }

  const plan = org.plan as PlanTier;
  const status = org.subscriptionStatus as SubscriptionStatus;

  if (!isSubscriptionActive(status)) {
    const readOnly = getReadOnlyStatuses();
    if (readOnly.includes(status)) {
      return { allowed: false, reason: "Subscription is inactive. Please renew to access this feature." };
    }
    return { allowed: false, reason: "Subscription status does not allow access." };
  }

  if (!hasFeature(plan, feature)) {
    return { allowed: false, reason: `This feature requires a higher plan. Current plan: ${plan}` };
  }

  return { allowed: true };
}

export async function isOrgReadOnly(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { subscriptionStatus: true },
  });

  if (!org) return true;

  const readOnly = getReadOnlyStatuses();
  return readOnly.includes(org.subscriptionStatus as SubscriptionStatus);
}

export async function getOrgPlanInfo(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      plan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      maxActiveAssessments: true,
      maxPartnerUsers: true,
    },
  });

  if (!org) return null;

  return {
    plan: org.plan as PlanTier,
    subscriptionStatus: org.subscriptionStatus as SubscriptionStatus,
    trialEndsAt: org.trialEndsAt,
    isActive: isSubscriptionActive(org.subscriptionStatus as SubscriptionStatus),
    isReadOnly: getReadOnlyStatuses().includes(org.subscriptionStatus as SubscriptionStatus),
  };
}
