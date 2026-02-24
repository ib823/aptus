/** ScopeItem queries */

import { prisma } from "@/lib/db/prisma";
import { getCatalogScopeData } from "@/lib/db/cached-queries";

export async function getScopeItemsWithSelections(assessmentId: string) {
  // Cached catalog data (1hr) + fresh selections query
  const [catalog, selections] = await Promise.all([
    getCatalogScopeData(),
    prisma.scopeSelection.findMany({
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
    }),
  ]);

  const selectionMap = new Map(
    selections.map((s) => [s.scopeItemId, s]),
  );

  return catalog.scopeItems.map((item) => {
    const selection = selectionMap.get(item.id);
    return {
      ...item,
      configCount: catalog.configCountMap[item.id] ?? 0,
      classifiableSteps: catalog.classifiableMap[item.id] ?? 0,
      effortDays: catalog.effortMap[item.id] ?? 0,
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
