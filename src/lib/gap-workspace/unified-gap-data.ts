/**
 * Phase 7 — AD-8: unified gap workspace data layer.
 *
 * Today's Adjust step pile-up has 6 sibling tabs (gaps / config /
 * integrations / data-migration / ocm / remaining). They aren't peers —
 * they're facets of the same gap. This module fetches the per-gap UNION
 * across all 5 register tables (Remaining is its own surface, not a gap
 * facet) so the unified workspace UI can render one row per gap with
 * tabs/sections inside for each facet.
 */

import { prisma } from "@/lib/db/prisma";

export interface GapFacets {
  gap: {
    id: string;
    scopeItemId: string;
    processStepId: string;
    gapDescription: string;
    resolutionType: string;
    resolutionDescription: string;
    effortDays: number | null;
    riskLevel: string | null;
    priority: string | null;
    clientApproved: boolean;
    decidedBy: string | null;
    decidedAt: Date | null;
  };
  scopeItem: { id: string; name: string; functionalArea: string } | null;
  /** Configs are scoped via configActivityId (which transitively references a scope item).
   * Workspace shows count + IDs; consumer drills down via /config?gapId. */
  configCount: number;
  integrationPoints: Array<{ id: string; name: string; sourceSystem: string; targetSystem: string; complexity: string | null }>;
  dataMigrationObjects: Array<{ id: string; objectName: string; sourceSystem: string; recordCount: number | null; mappingComplexity: string | null }>;
  ocmImpacts: Array<{ id: string; impactedRole: string; changeType: string; severity: string; affectedUserCount: number | null }>;
}

/**
 * Fetch all gap facets for an assessment in a single query graph. Each gap
 * row carries the related configs/integrations/dataMigration/ocm tied to
 * its scope item — this is the "rows view" the workspace renders.
 */
export async function getGapWorkspaceData(assessmentId: string): Promise<GapFacets[]> {
  const gaps = await prisma.gapResolution.findMany({
    where: { assessmentId },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  if (gaps.length === 0) return [];

  // Pull the related register data for the scope items referenced by these gaps.
  const scopeItemIds = Array.from(new Set(gaps.map((g) => g.scopeItemId)));

  const [scopeItems, integrationPoints, dataMigrationObjects, ocmImpacts] = await Promise.all([
    prisma.scopeItem.findMany({
      where: { id: { in: scopeItemIds } },
      select: { id: true, name: true, functionalArea: true },
    }),
    prisma.integrationPoint.findMany({
      where: { assessmentId, scopeItemId: { in: scopeItemIds } },
      select: { id: true, scopeItemId: true, name: true, sourceSystem: true, targetSystem: true, complexity: true },
    }),
    prisma.dataMigrationObject.findMany({
      where: { assessmentId, scopeItemId: { in: scopeItemIds } },
      select: { id: true, scopeItemId: true, objectName: true, sourceSystem: true, recordCount: true, mappingComplexity: true },
    }),
    prisma.ocmImpact.findMany({
      where: { assessmentId, scopeItemId: { in: scopeItemIds } },
      select: { id: true, scopeItemId: true, impactedRole: true, changeType: true, severity: true, affectedUserCount: true },
    }),
  ]);

  const scopeItemMap = new Map(scopeItems.map((s) => [s.id, s]));
  const integrationsByScope = groupBy(integrationPoints, (i) => i.scopeItemId ?? "");
  const dataMigrationByScope = groupBy(dataMigrationObjects, (d) => d.scopeItemId ?? "");
  const ocmByScope = groupBy(ocmImpacts, (o) => o.scopeItemId ?? "");

  return gaps.map((g) => ({
    gap: {
      id: g.id,
      scopeItemId: g.scopeItemId,
      processStepId: g.processStepId,
      gapDescription: g.gapDescription,
      resolutionType: g.resolutionType,
      resolutionDescription: g.resolutionDescription,
      effortDays: g.effortDays ?? g.implementationDays ?? null,
      riskLevel: g.riskLevel ?? g.riskCategory ?? null,
      priority: g.priority ?? null,
      clientApproved: g.clientApproved,
      decidedBy: g.decidedBy ?? null,
      decidedAt: g.decidedAt ?? null,
    },
    scopeItem: scopeItemMap.get(g.scopeItemId) ?? null,
    configCount: 0, // ConfigSelection scopes via configActivityId, not scopeItemId.
                    // Workspace shows scope-item-level config presence via a separate
                    // query (scope item → ConfigActivity → ConfigSelection chain);
                    // out of Phase-7 scaffolding, materialised in follow-up.
    integrationPoints: integrationsByScope.get(g.scopeItemId) ?? [],
    dataMigrationObjects: dataMigrationByScope.get(g.scopeItemId) ?? [],
    ocmImpacts: ocmByScope.get(g.scopeItemId) ?? [],
  }));
}

function groupBy<T, K>(arr: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of arr) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(item);
  }
  return m;
}
