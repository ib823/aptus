import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

/** Catalog counts — cached 1 hour, invalidated by "catalog" tag */
export const getCatalogStats = unstable_cache(
  async () => {
    const [scopeItems, processSteps, configActivities] = await Promise.all([
      prisma.scopeItem.count(),
      prisma.processStep.count(),
      prisma.configActivity.count(),
    ]);
    return { scopeItems, processSteps, configActivities };
  },
  ["catalog-stats"],
  { revalidate: 3600, tags: ["catalog"] },
);

/** Intelligence layer counts — cached 5 min, invalidated by "intelligence" tag */
export const getIntelligenceStats = unstable_cache(
  async () => {
    const [industries, baselines, extensibilityPatterns, adaptationPatterns] = await Promise.all([
      prisma.industryProfile.count(),
      prisma.effortBaseline.count(),
      prisma.extensibilityPattern.count(),
      prisma.adaptationPattern.count(),
    ]);
    return { industries, baselines, extensibilityPatterns, adaptationPatterns };
  },
  ["intelligence-stats"],
  { revalidate: 300, tags: ["intelligence"] },
);

/** Scope item count — cached 1 hour, invalidated by "catalog" tag */
export const getScopeItemCount = unstable_cache(
  async () => prisma.scopeItem.count(),
  ["scope-item-count"],
  { revalidate: 3600, tags: ["catalog"] },
);

/** Catalog scope data — cached 1 hour, invalidated by "catalog" tag.
 *  Returns scope items (without HTML), config counts, classifiable step counts, and effort baselines.
 */
export const getCatalogScopeData = unstable_cache(
  async () => {
    const NON_CLASSIFIABLE_TYPES = ["LOGON", "LOGOFF", "ACCESS_APP", "INFORMATION"];

    const [scopeItems, configCounts, classifiableCounts, effortBaselines] = await Promise.all([
      prisma.scopeItem.findMany({
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
          setupPdfStored: true,
        },
      }),
      prisma.configActivity.groupBy({
        by: ["scopeItemId"],
        _count: { id: true },
      }),
      prisma.processStep.groupBy({
        by: ["scopeItemId"],
        where: { stepType: { notIn: NON_CLASSIFIABLE_TYPES } },
        _count: { id: true },
      }),
      prisma.effortBaseline.findMany({
        select: {
          scopeItemId: true,
          implementationDays: true,
        },
      }),
    ]);

    const configCountMap = Object.fromEntries(
      configCounts.map((c) => [c.scopeItemId, c._count.id]),
    );
    const classifiableMap = Object.fromEntries(
      classifiableCounts.map((c) => [c.scopeItemId, c._count.id]),
    );
    const effortMap = Object.fromEntries(
      effortBaselines.map((e) => [e.scopeItemId, e.implementationDays]),
    );

    return { scopeItems, configCountMap, classifiableMap, effortMap };
  },
  ["catalog-scope-data"],
  { revalidate: 3600, tags: ["catalog"] },
);
