/** ProcessStep queries */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function getSelectedScopeItemsWithProgress(assessmentId: string) {
  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: { scopeItemId: true },
  });
  const selectedIds = selections.map((s) => s.scopeItemId);
  if (selectedIds.length === 0) return [];

  const [items, statusRows] = await Promise.all([
    prisma.scopeItem.findMany({
      where: { id: { in: selectedIds } },
      orderBy: [{ functionalArea: "asc" }, { nameClean: "asc" }],
      select: { id: true, nameClean: true, functionalArea: true, totalSteps: true },
    }),
    prisma.$queryRaw<Array<{ scopeItemId: string; fitStatus: string; count: number }>>`
      SELECT ps."scopeItemId", sr."fitStatus", COUNT(*)::int as count
      FROM "StepResponse" sr
      JOIN "ProcessStep" ps ON sr."processStepId" = ps.id
      WHERE sr."assessmentId" = ${assessmentId}
        AND ps."scopeItemId" IN (${Prisma.join(selectedIds)})
      GROUP BY ps."scopeItemId", sr."fitStatus"
    `,
  ]);

  const statusCounts = new Map<string, { fit: number; configure: number; gap: number; na: number; pending: number }>();
  for (const item of items) {
    statusCounts.set(item.id, { fit: 0, configure: 0, gap: 0, na: 0, pending: 0 });
  }
  for (const row of statusRows) {
    const counts = statusCounts.get(row.scopeItemId);
    if (!counts) continue;
    switch (row.fitStatus) {
      case "FIT": counts.fit = row.count; break;
      case "CONFIGURE": counts.configure = row.count; break;
      case "GAP": counts.gap = row.count; break;
      case "NA": counts.na = row.count; break;
    }
  }

  return items.map((item) => {
    const counts = statusCounts.get(item.id)!;
    const reviewed = counts.fit + counts.configure + counts.gap + counts.na;
    counts.pending = item.totalSteps - reviewed;
    return {
      ...item,
      reviewedSteps: reviewed,
      ...counts,
    };
  });
}

export async function getStepsForScopeItem(
  scopeItemId: string,
  assessmentId: string,
  opts?: {
    cursor?: string;
    limit?: number;
    hideRepetitive?: boolean;
    activityId?: string;
  },
) {
  const limit = opts?.limit ?? 50;
  const repetitiveTypes = ["LOGON", "ACCESS_APP"];

  const where: Record<string, unknown> = { scopeItemId };
  if (opts?.hideRepetitive) {
    where.stepType = { notIn: repetitiveTypes };
  }
  if (opts?.activityId) {
    where.activityId = opts.activityId;
  }

  const steps = await prisma.processStep.findMany({
    where,
    orderBy: { sequence: "asc" },
    take: limit + 1,
    ...(opts?.cursor
      ? { cursor: { id: opts.cursor }, skip: 1 }
      : {}),
    select: {
      id: true,
      scopeItemId: true,
      sequence: true,
      actionTitle: true,
      actionInstructionsHtml: true,
      actionExpectedResult: true,
      stepType: true,
      processFlowGroup: true,
      activityTitle: true,
      activityTargetUrl: true,
      activityId: true,
      solutionProcessFlowName: true,
      stepCategory: true,
      isClassifiable: true,
      groupKey: true,
      groupLabel: true,
    },
  });

  const hasMore = steps.length > limit;
  if (hasMore) steps.pop();

  // Get responses for these steps
  const stepIds = steps.map((s) => s.id);
  const responses = await prisma.stepResponse.findMany({
    where: {
      assessmentId,
      processStepId: { in: stepIds },
    },
    select: {
      processStepId: true,
      fitStatus: true,
      clientNote: true,
      currentProcess: true,
      respondent: true,
      respondedAt: true,
      confidence: true,
      evidenceUrls: true,
      reviewedBy: true,
      reviewedAt: true,
    },
  });

  const responseMap = new Map(
    responses.map((r) => [r.processStepId, r]),
  );

  return {
    steps: steps.map((step) => {
      const response = responseMap.get(step.id);
      return {
        ...step,
        fitStatus: response?.fitStatus ?? "PENDING",
        clientNote: response?.clientNote ?? null,
        currentProcess: response?.currentProcess ?? null,
        respondent: response?.respondent ?? null,
        respondedAt: response?.respondedAt?.toISOString() ?? null,
        confidence: response?.confidence ?? null,
        evidenceUrls: response?.evidenceUrls ?? [],
        reviewedBy: response?.reviewedBy ?? null,
        reviewedAt: response?.reviewedAt?.toISOString() ?? null,
      };
    }),
    nextCursor: hasMore ? steps[steps.length - 1]?.id ?? null : null,
    hasMore,
  };
}

export async function getConfigsForScopeItem(scopeItemId: string) {
  return prisma.configActivity.findMany({
    where: { scopeItemId },
    select: {
      id: true,
      configItemName: true,
      activityDescription: true,
      category: true,
      selfService: true,
      applicationArea: true,
    },
    orderBy: [{ category: "asc" }, { configItemName: "asc" }],
  });
}

export async function getOverallReviewProgress(assessmentId: string) {
  const selectedItems = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: { scopeItemId: true },
  });

  const scopeItemIds = selectedItems.map((s) => s.scopeItemId);

  const [totalSteps, classifiableSteps] = await Promise.all([
    prisma.processStep.count({
      where: { scopeItemId: { in: scopeItemIds } },
    }),
    prisma.processStep.count({
      where: { scopeItemId: { in: scopeItemIds }, isClassifiable: true },
    }),
  ]);

  const reviewedSteps = await prisma.stepResponse.count({
    where: {
      assessmentId,
      fitStatus: { not: "PENDING" },
      processStep: {
        scopeItemId: { in: scopeItemIds },
      },
    },
  });

  const statusCounts = await prisma.stepResponse.groupBy({
    by: ["fitStatus"],
    where: {
      assessmentId,
      processStep: {
        scopeItemId: { in: scopeItemIds },
      },
    },
    _count: { id: true },
  });

  const counts = {
    fit: 0,
    configure: 0,
    gap: 0,
    na: 0,
    pending: 0,
  };

  for (const row of statusCounts) {
    switch (row.fitStatus) {
      case "FIT": counts.fit = row._count.id; break;
      case "CONFIGURE": counts.configure = row._count.id; break;
      case "GAP": counts.gap = row._count.id; break;
      case "NA": counts.na = row._count.id; break;
    }
  }
  counts.pending = totalSteps - reviewedSteps;

  return {
    totalSteps,
    classifiableSteps,
    reviewedSteps,
    ...counts,
  };
}
