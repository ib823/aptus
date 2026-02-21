/** ScopeItem queries */

import { prisma } from "@/lib/db/prisma";

export async function getScopeItemsWithSelections(assessmentId: string) {
  const scopeItems = await prisma.scopeItem.findMany({
    orderBy: [{ functionalArea: "asc" }, { nameClean: "asc" }],
    select: {
      id: true,
      name: true,
      nameClean: true,
      country: true,
      totalSteps: true,
      functionalArea: true,
      subArea: true,
      tutorialUrl: true,
      purposeHtml: true,
      overviewHtml: true,
      prerequisitesHtml: true,
      setupPdfStored: true,
    },
  });

  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId },
    select: {
      scopeItemId: true,
      selected: true,
      relevance: true,
      currentState: true,
      notes: true,
      respondent: true,
      respondedAt: true,
      priority: true,
      businessJustification: true,
      estimatedComplexity: true,
      dependsOnScopeItems: true,
    },
  });

  const selectionMap = new Map(
    selections.map((s) => [s.scopeItemId, s]),
  );

  // Count configs per scope item
  const configCounts = await prisma.configActivity.groupBy({
    by: ["scopeItemId"],
    _count: { id: true },
  });
  const configCountMap = new Map(
    configCounts.map((c) => [c.scopeItemId, c._count.id]),
  );

  return scopeItems.map((item) => {
    const selection = selectionMap.get(item.id);
    return {
      ...item,
      configCount: configCountMap.get(item.id) ?? 0,
      selected: selection?.selected ?? false,
      relevance: selection?.relevance ?? null,
      currentState: selection?.currentState ?? null,
      notes: selection?.notes ?? null,
      respondent: selection?.respondent ?? null,
      respondedAt: selection?.respondedAt?.toISOString() ?? null,
      priority: selection?.priority ?? null,
      businessJustification: selection?.businessJustification ?? null,
      estimatedComplexity: selection?.estimatedComplexity ?? null,
      dependsOnScopeItems: selection?.dependsOnScopeItems ?? [],
    };
  });
}

export async function getFunctionalAreas(): Promise<string[]> {
  const areas = await prisma.scopeItem.findMany({
    select: { functionalArea: true },
    distinct: ["functionalArea"],
    orderBy: { functionalArea: "asc" },
  });
  return areas.map((a) => a.functionalArea);
}

export async function getScopeItemImpact(scopeItemId: string) {
  const NON_CLASSIFIABLE_TYPES = ["LOGON", "ACCESS_APP", "INFORMATION"];

  const [totalSteps, classifiableSteps, configCount, effortBaseline] = await Promise.all([
    prisma.processStep.count({ where: { scopeItemId } }),
    prisma.processStep.count({
      where: { scopeItemId, stepType: { notIn: NON_CLASSIFIABLE_TYPES } },
    }),
    prisma.configActivity.count({ where: { scopeItemId } }),
    prisma.effortBaseline.findFirst({
      where: { scopeItemId },
      select: {
        complexity: true,
        implementationDays: true,
        configDays: true,
        testDays: true,
        dataMigrationDays: true,
        trainingDays: true,
      },
    }),
  ]);

  return {
    totalSteps,
    classifiableSteps,
    configCount,
    effortBaseline,
  };
}

export async function getIndustryPreSelections(industryCode: string): Promise<string[]> {
  const profile = await prisma.industryProfile.findUnique({
    where: { code: industryCode },
    select: { applicableScopeItems: true },
  });
  return profile?.applicableScopeItems ?? [];
}
