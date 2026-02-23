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
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { plan: true, maxActiveAssessments: true },
  });

  const limits = getPlanLimits(org.plan as PlanTier);
  const effectiveLimit = Math.min(org.maxActiveAssessments, limits.maxActiveAssessments);

  const current = await prisma.assessment.count({
    where: {
      organizationId,
      deletedAt: null,
      status: { notIn: ["archived", "canceled"] },
    },
  });

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
        status: { notIn: ["archived", "canceled"] },
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
