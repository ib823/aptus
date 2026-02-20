/** Config matrix queries */

import { prisma } from "@/lib/db/prisma";

export async function getConfigsForSelectedScope(
  assessmentId: string,
  opts?: {
    category?: string | undefined;
    selfService?: boolean | undefined;
    scopeItemId?: string | undefined;
    search?: string | undefined;
    cursor?: string | undefined;
    limit?: number | undefined;
  },
) {
  // Get selected scope item IDs
  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: { scopeItemId: true },
  });
  const selectedIds = selections.map((s) => s.scopeItemId);

  const limit = opts?.limit ?? 50;
  const where: Record<string, unknown> = {
    scopeItemId: opts?.scopeItemId
      ? opts.scopeItemId
      : { in: selectedIds },
  };

  if (opts?.category) where.category = opts.category;
  if (opts?.selfService !== undefined) where.selfService = opts.selfService;
  if (opts?.search) {
    where.OR = [
      { configItemName: { contains: opts.search, mode: "insensitive" } },
      { activityDescription: { contains: opts.search, mode: "insensitive" } },
    ];
  }

  const configs = await prisma.configActivity.findMany({
    where,
    orderBy: [{ category: "asc" }, { configItemName: "asc" }],
    take: limit + 1,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      scopeItemId: true,
      scopeItemDescription: true,
      configItemName: true,
      configItemId: true,
      activityDescription: true,
      selfService: true,
      configApproach: true,
      category: true,
      activityId: true,
      applicationArea: true,
      applicationSubarea: true,
      localizationScope: true,
      countrySpecific: true,
      redoInProduction: true,
      componentId: true,
      additionalInfo: true,
    },
  });

  const hasMore = configs.length > limit;
  if (hasMore) configs.pop();

  // Get scope item names for display
  const scopeItemIds = [...new Set(configs.map((c) => c.scopeItemId))];
  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: scopeItemIds } },
    select: {
      id: true,
      nameClean: true,
      setupPdfStored: true,
    },
  });
  const scopeItemMap = new Map(scopeItems.map((s) => [s.id, s]));

  // Get config selections for this assessment
  const configIds = configs.map((c) => c.id);
  const configSelections = await prisma.configSelection.findMany({
    where: { assessmentId, configActivityId: { in: configIds } },
    select: { configActivityId: true, included: true, excludeReason: true },
  });
  const selectionMap = new Map(
    configSelections.map((s) => [s.configActivityId, s]),
  );

  return {
    configs: configs.map((config) => {
      const selection = selectionMap.get(config.id);
      // Mandatory always included; Recommended included by default; Optional excluded by default
      const defaultIncluded = config.category !== "Optional";
      return {
        ...config,
        scopeItemName: scopeItemMap.get(config.scopeItemId)?.nameClean ?? config.scopeItemId,
        setupPdfStored: scopeItemMap.get(config.scopeItemId)?.setupPdfStored ?? false,
        included: selection ? selection.included : defaultIncluded,
        excludeReason: selection?.excludeReason ?? null,
      };
    }),
    nextCursor: hasMore ? configs[configs.length - 1]?.id ?? null : null,
    hasMore,
  };
}

export async function getConfigSummary(assessmentId: string) {
  const selections = await prisma.scopeSelection.findMany({
    where: { assessmentId, selected: true },
    select: { scopeItemId: true },
  });
  const selectedIds = selections.map((s) => s.scopeItemId);

  const counts = await prisma.configActivity.groupBy({
    by: ["category"],
    where: { scopeItemId: { in: selectedIds } },
    _count: { id: true },
  });

  const selfServiceCount = await prisma.configActivity.count({
    where: {
      scopeItemId: { in: selectedIds },
      selfService: true,
    },
  });

  // Count excluded recommended configs
  const allRecommendedIds = await prisma.configActivity.findMany({
    where: { scopeItemId: { in: selectedIds }, category: "Recommended" },
    select: { id: true },
  });
  const excludedRecommended = await prisma.configSelection.count({
    where: {
      assessmentId,
      configActivityId: { in: allRecommendedIds.map((r) => r.id) },
      included: false,
    },
  });

  // Count included optional configs
  const allOptionalIds = await prisma.configActivity.findMany({
    where: { scopeItemId: { in: selectedIds }, category: "Optional" },
    select: { id: true },
  });
  const includedOptional = await prisma.configSelection.count({
    where: {
      assessmentId,
      configActivityId: { in: allOptionalIds.map((r) => r.id) },
      included: true,
    },
  });

  const result = {
    mandatory: 0,
    recommended: 0,
    optional: 0,
    total: 0,
    selfService: selfServiceCount,
    excludedRecommended,
    includedOptional,
  };
  for (const row of counts) {
    const count = row._count.id;
    result.total += count;
    if (row.category === "Mandatory") result.mandatory = count;
    else if (row.category === "Recommended") result.recommended = count;
    else if (row.category === "Optional") result.optional = count;
  }

  return result;
}
