/** Usage metering — records events and enforces plan limits */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getPlanLimits } from "@/lib/commercial/plan-engine";
import type { PlanTier, UsageEventType } from "@/types/commercial";

export async function recordUsageEvent(
  organizationId: string,
  eventType: UsageEventType,
  entityId?: string | undefined,
  metadata?: Record<string, unknown> | undefined,
): Promise<void> {
  await prisma.usageEvent.create({
    data: {
      organizationId,
      eventType,
      entityId: entityId ?? null,
      metadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
}

export async function checkAssessmentLimit(organizationId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
}> {
  const current = await prisma.assessment.count({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: ["archived"] },
    },
  });

  // Internal test deployments (INTERNAL_TEST_DEPLOYMENT=true) have no
  // assessment cap so the team can create as many as they need while testing.
  // Never true on a customer-facing production deploy.
  if (process.env.INTERNAL_TEST_DEPLOYMENT === "true") {
    return { allowed: true, current, limit: Infinity };
  }

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { plan: true, maxActiveAssessments: true },
  });

  const limits = getPlanLimits(org.plan as PlanTier);
  const effectiveLimit = Math.min(org.maxActiveAssessments, limits.maxActiveAssessments);

  return {
    allowed: current < effectiveLimit,
    current,
    limit: effectiveLimit,
  };
}

export async function checkUserLimit(organizationId: string): Promise<{
  allowed: boolean;
  current: number;
  limit: number;
}> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { plan: true, maxPartnerUsers: true },
  });

  const limits = getPlanLimits(org.plan as PlanTier);
  const effectiveLimit = Math.min(org.maxPartnerUsers, limits.maxPartnerUsers);

  const current = await prisma.user.count({
    where: { organizationId, isActive: true },
  });

  return {
    allowed: current < effectiveLimit,
    current,
    limit: effectiveLimit,
  };
}

export async function getUsageMetrics(organizationId: string) {
  const [assessmentCount, userCount, org] = await Promise.all([
    prisma.assessment.count({
      where: {
        organizationId,
        deletedAt: null,
        // "canceled" was previously listed defensively but is not a real
       // AssessmentStatus value — dropped now that the column is enum-typed.
      status: { notIn: ["archived"] },
      },
    }),
    prisma.user.count({
      where: { organizationId, isActive: true },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { plan: true, maxActiveAssessments: true, maxPartnerUsers: true },
    }),
  ]);

  const limits = getPlanLimits(org.plan as PlanTier);

  return {
    assessments: {
      current: assessmentCount,
      limit: Math.min(org.maxActiveAssessments, limits.maxActiveAssessments),
    },
    users: {
      current: userCount,
      limit: Math.min(org.maxPartnerUsers, limits.maxPartnerUsers),
    },
  };
}
