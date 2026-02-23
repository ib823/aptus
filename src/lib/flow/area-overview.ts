/** Phase 20: Functional area overview computation */

import { prisma } from "@/lib/db/prisma";
import { computeRiskScore } from "@/lib/assessment/risk-score";
import type {
  FunctionalAreaOverviewData,
  AreaScopeItemSummary,
  CrossAreaDep,
} from "@/types/flow";
import type { InputJsonValue } from "@prisma/client/runtime/library";

/**
 * Compute functional area overviews for an assessment and upsert to DB.
 * Returns the computed data array.
 */
export async function computeFunctionalAreaOverview(
  assessmentId: string,
): Promise<FunctionalAreaOverviewData[]> {
  // 1. Load selected scope items
  const scopeSelections = await prisma.scopeSelection.findMany({
    where: { assessmentId },
    select: { scopeItemId: true, selected: true },
  });

  const selectedIds = scopeSelections
    .filter((s) => s.selected)
    .map((s) => s.scopeItemId);

  const scopeItems = await prisma.scopeItem.findMany({
    where: { id: { in: selectedIds } },
    select: {
      id: true,
      nameClean: true,
      functionalArea: true,
      totalSteps: true,
    },
  });

  // 2. Load step responses
  const stepResponses = await prisma.stepResponse.findMany({
    where: { assessmentId },
    select: {
      fitStatus: true,
      processStep: { select: { scopeItemId: true } },
    },
  });

  // 3. Load gap resolutions
  const gapResolutions = await prisma.gapResolution.findMany({
    where: { assessmentId },
    select: { scopeItemId: true, resolutionType: true },
  });

  // 4. Load integration points for cross-area dependencies
  const integrations = await prisma.integrationPoint.findMany({
    where: { assessmentId },
    select: { sourceSystem: true, targetSystem: true, scopeItemId: true },
  });

  // 5. Build per-area data
  const areaMap = new Map<string, FunctionalAreaOverviewData>();

  // Group scope items by area
  const allAreas = new Set(scopeItems.map((si) => si.functionalArea));
  for (const area of allAreas) {
    areaMap.set(area, {
      functionalArea: area,
      totalScopeItems: 0,
      selectedCount: 0,
      fitCount: 0,
      configureCount: 0,
      gapCount: 0,
      pendingCount: 0,
      riskScore: 0,
      completionPct: 0,
      crossAreaDeps: [],
      scopeItems: [],
    });
  }

  for (const si of scopeItems) {
    const areaData = areaMap.get(si.functionalArea);
    if (!areaData) continue;

    // Count statuses for this scope item
    const itemResponses = stepResponses.filter(
      (r) => r.processStep.scopeItemId === si.id,
    );

    let itemFit = 0;
    let itemConfigure = 0;
    let itemGap = 0;
    for (const r of itemResponses) {
      switch (r.fitStatus) {
        case "FIT": itemFit++; break;
        case "CONFIGURE": itemConfigure++; break;
        case "GAP": itemGap++; break;
        default: break;
      }
    }
    const itemPending = Math.max(0, si.totalSteps - itemResponses.length);
    const completionPct = si.totalSteps > 0
      ? Math.round((itemResponses.length / si.totalSteps) * 100)
      : 0;

    areaData.fitCount += itemFit;
    areaData.configureCount += itemConfigure;
    areaData.gapCount += itemGap;
    areaData.pendingCount += itemPending;
    areaData.selectedCount++;

    areaData.scopeItems.push({
      scopeItemId: si.id,
      scopeItemName: si.nameClean,
      totalSteps: si.totalSteps,
      fitCount: itemFit,
      configureCount: itemConfigure,
      gapCount: itemGap,
      pendingCount: itemPending,
      completionPct,
    });
  }

  // Count total scope items per area (including non-selected)
  const allScopeItems = await prisma.scopeItem.findMany({
    where: { functionalArea: { in: [...allAreas] } },
    select: { functionalArea: true },
  });
  for (const si of allScopeItems) {
    const areaData = areaMap.get(si.functionalArea);
    if (areaData) areaData.totalScopeItems++;
  }

  // 6. Compute risk scores, completion, cross-area deps
  for (const areaData of areaMap.values()) {
    const totalSteps = areaData.scopeItems.reduce((sum, si) => sum + si.totalSteps, 0);
    const totalResponded = areaData.fitCount + areaData.configureCount + areaData.gapCount;
    areaData.completionPct = totalSteps > 0
      ? Math.round((totalResponded / totalSteps) * 100)
      : 0;

    const areaScopeItemIds = areaData.scopeItems.map((si) => si.scopeItemId);
    const areaResolutions = gapResolutions
      .filter((r) => areaScopeItemIds.includes(r.scopeItemId))
      .map((r) => r.resolutionType);

    areaData.riskScore = computeRiskScore(
      totalSteps,
      areaData.gapCount,
      areaData.pendingCount,
      areaResolutions,
    );

    // Cross-area dependencies from integration points
    const deps: CrossAreaDep[] = [];
    for (const intPt of integrations) {
      if (!areaScopeItemIds.includes(intPt.scopeItemId ?? "")) continue;
      const targetArea = scopeItems.find((si) =>
        si.nameClean === intPt.targetSystem || si.functionalArea === intPt.targetSystem,
      )?.functionalArea;
      if (targetArea && targetArea !== areaData.functionalArea) {
        deps.push({
          fromArea: areaData.functionalArea,
          toArea: targetArea,
          scopeItemId: intPt.scopeItemId ?? "",
          reason: `Integration: ${intPt.sourceSystem} → ${intPt.targetSystem}`,
        });
      }
    }
    areaData.crossAreaDeps = deps;
  }

  // 7. Upsert to DB
  const results = [...areaMap.values()].sort((a, b) =>
    a.functionalArea.localeCompare(b.functionalArea),
  );

  for (const area of results) {
    await prisma.functionalAreaOverview.upsert({
      where: {
        assessmentId_functionalArea: {
          assessmentId,
          functionalArea: area.functionalArea,
        },
      },
      update: {
        totalScopeItems: area.totalScopeItems,
        selectedCount: area.selectedCount,
        fitCount: area.fitCount,
        configureCount: area.configureCount,
        gapCount: area.gapCount,
        pendingCount: area.pendingCount,
        riskScore: area.riskScore,
        completionPct: area.completionPct,
        crossAreaDeps: JSON.parse(JSON.stringify(area.crossAreaDeps)) as InputJsonValue,
        scopeItems: JSON.parse(JSON.stringify(area.scopeItems)) as InputJsonValue,
      },
      create: {
        assessmentId,
        functionalArea: area.functionalArea,
        totalScopeItems: area.totalScopeItems,
        selectedCount: area.selectedCount,
        fitCount: area.fitCount,
        configureCount: area.configureCount,
        gapCount: area.gapCount,
        pendingCount: area.pendingCount,
        riskScore: area.riskScore,
        completionPct: area.completionPct,
        crossAreaDeps: JSON.parse(JSON.stringify(area.crossAreaDeps)) as InputJsonValue,
        scopeItems: JSON.parse(JSON.stringify(area.scopeItems)) as InputJsonValue,
      },
    });
  }

  return results;
}

/**
 * Compute risk score for a functional area (exported for reuse).
 */
export function computeAreaRiskScore(
  fitCount: number,
  configureCount: number,
  gapCount: number,
  pendingCount: number,
  resolvedGapCount: number,
): number {
  const total = fitCount + configureCount + gapCount + pendingCount;
  if (total === 0) return 0;

  const adjustedGapCount = Math.max(0, gapCount - resolvedGapCount * 0.5);
  const raw =
    (adjustedGapCount * 0.8 + pendingCount * 0.5 + configureCount * 0.2) / total;

  return Math.min(1, Math.max(0, Math.round(raw * 1000) / 1000));
}
