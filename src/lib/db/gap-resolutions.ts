/** GapResolution queries */

import { prisma } from "@/lib/db/prisma";

export async function getGapsForAssessment(
  assessmentId: string,
  opts?: {
    scopeItemId?: string | undefined;
    resolutionType?: string | undefined;
    priority?: string | undefined;
    riskCategory?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  },
) {
  const limit = opts?.limit ?? 100;
  const where: Record<string, unknown> = { assessmentId };
  if (opts?.scopeItemId) where.scopeItemId = opts.scopeItemId;
  if (opts?.resolutionType) where.resolutionType = opts.resolutionType;
  if (opts?.priority) where.priority = opts.priority;
  if (opts?.riskCategory) where.riskCategory = opts.riskCategory;

  const gaps = await prisma.gapResolution.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: limit + 1,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: {
      alternativeResolutions: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const hasMore = gaps.length > limit;
  if (hasMore) gaps.pop();

  // Enrich with step and scope item info
  const stepIds = gaps.map((g) => g.processStepId);
  const scopeItemIds = [...new Set(gaps.map((g) => g.scopeItemId))];

  const [steps, scopeItems] = await Promise.all([
    prisma.processStep.findMany({
      where: { id: { in: stepIds } },
      select: {
        id: true,
        actionTitle: true,
        sequence: true,
        processFlowGroup: true,
      },
    }),
    prisma.scopeItem.findMany({
      where: { id: { in: scopeItemIds } },
      select: {
        id: true,
        nameClean: true,
        functionalArea: true,
      },
    }),
  ]);

  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const scopeItemMap = new Map(scopeItems.map((s) => [s.id, s]));

  // Get client notes from step responses
  const responses = await prisma.stepResponse.findMany({
    where: {
      assessmentId,
      processStepId: { in: stepIds },
    },
    select: {
      processStepId: true,
      clientNote: true,
    },
  });
  const noteMap = new Map(responses.map((r) => [r.processStepId, r.clientNote]));

  return {
    gaps: gaps.map((gap) => {
      const step = stepMap.get(gap.processStepId);
      const scopeItem = scopeItemMap.get(gap.scopeItemId);
      return {
        ...gap,
        costEstimate: gap.costEstimate as Record<string, unknown> | null,
        processStep: step ?? null,
        scopeItem: scopeItem ?? null,
        clientNote: noteMap.get(gap.processStepId) ?? null,
        alternativeCount: gap.alternativeResolutions?.length ?? 0,
      };
    }),
    nextCursor: hasMore ? gaps[gaps.length - 1]?.id ?? null : null,
    hasMore,
  };
}

export async function getGapSummaryStats(assessmentId: string) {
  const gaps = await prisma.gapResolution.findMany({
    where: { assessmentId },
    select: {
      resolutionType: true,
      effortDays: true,
      clientApproved: true,
      priority: true,
      oneTimeCost: true,
      recurringCost: true,
      implementationDays: true,
      riskCategory: true,
    },
  });

  const total = gaps.length;
  const resolved = gaps.filter((g) => g.resolutionType !== "PENDING").length;
  const approved = gaps.filter((g) => g.clientApproved).length;
  const totalEffort = gaps.reduce((sum, g) => sum + (g.effortDays ?? 0), 0);
  const totalOneTimeCost = gaps.reduce((sum, g) => sum + (g.oneTimeCost ?? 0), 0);
  const totalRecurringCost = gaps.reduce((sum, g) => sum + (g.recurringCost ?? 0), 0);
  const totalImplementationDays = gaps.reduce((sum, g) => sum + (g.implementationDays ?? 0), 0);

  const byType = new Map<string, number>();
  for (const gap of gaps) {
    byType.set(gap.resolutionType, (byType.get(gap.resolutionType) ?? 0) + 1);
  }

  const byPriority = new Map<string, number>();
  for (const gap of gaps) {
    if (gap.priority) {
      byPriority.set(gap.priority, (byPriority.get(gap.priority) ?? 0) + 1);
    }
  }

  const byRiskCategory = new Map<string, number>();
  for (const gap of gaps) {
    if (gap.riskCategory) {
      byRiskCategory.set(gap.riskCategory, (byRiskCategory.get(gap.riskCategory) ?? 0) + 1);
    }
  }

  return {
    total,
    resolved,
    approved,
    pending: total - resolved,
    totalEffort,
    totalOneTimeCost,
    totalRecurringCost,
    totalImplementationDays,
    byType: Object.fromEntries(byType),
    byPriority: Object.fromEntries(byPriority),
    byRiskCategory: Object.fromEntries(byRiskCategory),
  };
}
