/** Trial management — create trials, check expiry, handle transitions */

import { prisma } from "@/lib/db/prisma";
import { canTransitionSubscription } from "@/lib/commercial/plan-engine";
import type { SubscriptionStatus } from "@/types/commercial";

const TRIAL_DURATION_DAYS = 14;

export async function createTrial(organizationId: string): Promise<Date> {
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      plan: "TRIAL",
      subscriptionStatus: "TRIALING",
      trialEndsAt,
      maxActiveAssessments: 1,
      maxPartnerUsers: 5,
    },
  });

  return trialEndsAt;
}

export async function checkAndExpireTrials(): Promise<number> {
  const now = new Date();

  const expiredOrgs = await prisma.organization.findMany({
    where: {
      subscriptionStatus: "TRIALING",
      trialEndsAt: { lte: now },
    },
    select: { id: true },
  });

  if (expiredOrgs.length === 0) return 0;

  const ids = expiredOrgs.map((o) => o.id);

  await prisma.organization.updateMany({
    where: { id: { in: ids } },
    data: { subscriptionStatus: "TRIAL_EXPIRED" },
  });

  return expiredOrgs.length;
}

export async function getTrialStatus(organizationId: string): Promise<{
  isTrial: boolean;
  daysRemaining: number;
  trialEndsAt: Date | null;
}> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { subscriptionStatus: true, trialEndsAt: true },
  });

  if (org.subscriptionStatus !== "TRIALING" || !org.trialEndsAt) {
    return { isTrial: false, daysRemaining: 0, trialEndsAt: null };
  }

  const now = new Date();
  const diff = org.trialEndsAt.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));

  return {
    isTrial: true,
    daysRemaining,
    trialEndsAt: org.trialEndsAt,
  };
}

/**
 * Activate a paid plan for an organization. Used by internal admin tooling
 * (no payment processor is wired); validates the lifecycle transition is
 * legal before applying.
 */
export async function activateSubscription(
  organizationId: string,
  plan: string,
): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { subscriptionStatus: true },
  });

  const from = org.subscriptionStatus as SubscriptionStatus;
  if (!canTransitionSubscription(from, "ACTIVE")) {
    throw new Error(`Cannot transition from ${from} to ACTIVE`);
  }

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      plan,
      subscriptionStatus: "ACTIVE",
    },
  });
}

export { TRIAL_DURATION_DAYS };
