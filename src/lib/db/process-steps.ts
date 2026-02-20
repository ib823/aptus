/** ProcessStep queries */

import { prisma } from "@/lib/db/prisma";

export async function getSelectedScopeItemsWithProgress(assessmentId: string) {
  // Get selected scope item IDs
  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: { scopeItemId: true },
  });
  const selectedIds = selections.map((s) => s.scopeItemId);

  const items = await prisma.scopeItem.findMany({
    where: { id: { in: selectedIds } },
    orderBy: [{ functionalArea: "asc" }, { nameClean: "asc" }],
    select: {
      id: true,
      nameClean: true,
      functionalArea: true,
      totalSteps: true,
    },
  });

  // Get response counts per scope item
  const responses = await prisma.stepResponse.groupBy({
    by: ["processStepId"],
    where: {
      assessmentId,
      fitStatus: { not: "PENDING" },
    },
    _count: { id: true },
  });

  // Map responses to scope items
  const steps = await prisma.processStep.findMany({
    where: {
      scopeItemId: { in: items.map((i) => i.id) },
    },
    select: {
      id: true,
      scopeItemId: true,
    },
  });

  const stepToScope = new Map<string, string>();
  for (const step of steps) {
    stepToScope.set(step.id, step.scopeItemId);
  }

  // Count reviewed steps per scope item
  const reviewedByScopeItem = new Map<string, number>();
  for (const r of responses) {
    const scopeItemId = stepToScope.get(r.processStepId);
    if (scopeItemId) {
      reviewedByScopeItem.set(
        scopeItemId,
        (reviewedByScopeItem.get(scopeItemId) ?? 0) + r._count.id,
      );
    }
  }

  // Get status counts per scope item
  const allResponses = await prisma.stepResponse.findMany({
    where: {
      assessmentId,
      processStep: {
        scopeItemId: { in: items.map((i) => i.id) },
      },
    },
    select: {
      fitStatus: true,
      processStep: {
        select: { scopeItemId: true },
      },
    },
  });

  const statusCounts = new Map<string, { fit: number; configure: number; gap: number; na: number; pending: number }>();
  for (const item of items) {
    statusCounts.set(item.id, { fit: 0, configure: 0, gap: 0, na: 0, pending: 0 });
  }

  for (const r of allResponses) {
    const counts = statusCounts.get(r.processStep.scopeItemId);
    if (!counts) continue;
    switch (r.fitStatus) {
      case "FIT": counts.fit++; break;
      case "CONFIGURE": counts.configure++; break;
      case "GAP": counts.gap++; break;
      case "NA": counts.na++; break;
    }
  }

  return items.map((item) => {
    const counts = statusCounts.get(item.id) ?? { fit: 0, configure: 0, gap: 0, na: 0, pending: 0 };
    const reviewed = reviewedByScopeItem.get(item.id) ?? 0;
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
  },
) {
  const limit = opts?.limit ?? 50;
  const repetitiveTypes = ["LOGON", "ACCESS_APP"];

  const where: Record<string, unknown> = { scopeItemId };
  if (opts?.hideRepetitive) {
    where.stepType = { notIn: repetitiveTypes };
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
      solutionProcessFlowName: true,
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

  const totalSteps = await prisma.processStep.count({
    where: { scopeItemId: { in: scopeItemIds } },
  });

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
    reviewedSteps,
    ...counts,
  };
}
