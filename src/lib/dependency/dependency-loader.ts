/**
 * Phase: Dependency Engine — Graph loader with module-level cache.
 *
 * Loads ActivityDependency records from the database and builds
 * a DependencyGraph. Caches graphs per scope item code.
 */

import { prisma } from "@/lib/db/prisma";
import { DependencyGraph } from "./dependency-graph";
import type { CrossScopeDependency } from "@prisma/client";

// Module-level cache: scopeItemCode → DependencyGraph
const graphCache = new Map<string, DependencyGraph>();

export async function getDependencyGraph(
  scopeItemCode: string,
): Promise<DependencyGraph> {
  const cached = graphCache.get(scopeItemCode);
  if (cached) return cached;

  const dependencies = await prisma.activityDependency.findMany({
    where: { scopeItemCode, isActive: true },
    include: {
      sourceActivity: { select: { id: true, title: true } },
      targetActivity: { select: { id: true, title: true } },
    },
  });

  const graph = new DependencyGraph(scopeItemCode, dependencies);
  graphCache.set(scopeItemCode, graph);
  return graph;
}

export function invalidateGraphCache(scopeItemCode?: string): void {
  if (scopeItemCode) {
    graphCache.delete(scopeItemCode);
  } else {
    graphCache.clear();
  }
}

export async function getCrossScopeDependencies(
  scopeItemCode: string,
): Promise<CrossScopeDependency[]> {
  return prisma.crossScopeDependency.findMany({
    where: {
      OR: [
        { sourceScopeCode: scopeItemCode },
        { targetScopeCode: scopeItemCode },
      ],
      isActive: true,
    },
  });
}
