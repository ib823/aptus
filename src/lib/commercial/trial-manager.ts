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

/**
 * Expire every trial whose end has passed. Returns how many THIS call expired.
 *
 * ONE CONDITIONAL UPDATE, NOT A SCAN AND THEN AN UPDATE BY ID. The scan-then-
 * update form had two defects that a second, overlapping run exposed (P0.18):
 * both runs scanned the same organizations and each reported all of them as
 * expired, so the jobs strip counted every expiry twice; and the update
 * matched by id alone, so an organization activated between the scan and the
 * update was written back to TRIAL_EXPIRED over its new paid status. The
 * predicate now lives in the UPDATE itself: Postgres re-checks it on each row
 * it locks, so a row is expired once, by one run, only while it is still a
 * lapsed trial, and the count is the rows this call actually changed.
 */
export async function checkAndExpireTrials(now: Date = new Date()): Promise<number> {
  const expired = await prisma.organization.updateMany({
    where: {
      subscriptionStatus: "TRIALING",
      trialEndsAt: { lte: now },
    },
    data: { subscriptionStatus: "TRIAL_EXPIRED" },
  });
  return expired.count;
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
