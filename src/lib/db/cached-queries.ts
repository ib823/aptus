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
