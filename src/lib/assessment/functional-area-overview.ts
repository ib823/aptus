import { computeRiskScore, computeRiskScoreFromResolutionCounts } from "@/lib/assessment/risk-score";
import type { FunctionalAreaOverviewData } from "@/types/flow";

interface ScopeItemInput {
  id: string;
  nameClean: string;
  functionalArea: string;
  totalSteps: number;
}

interface StepResponseInput {
  fitStatus: string;
  processStep: {
    scopeItemId: string;
  };
}

interface GapResolutionInput {
  scopeItemId: string;
  resolutionType: string;
}

interface StepResponseCountInput {
  scopeItemId: string;
  fitStatus: string;
  count: number;
}

interface GapResolutionCountInput {
  scopeItemId: string;
  resolutionType: string;
  count: number;
}

interface BuildFunctionalAreaOverviewInput {
  scopeItems: ScopeItemInput[];
  stepResponses: StepResponseInput[];
  gapResolutions: GapResolutionInput[];
}

interface BuildFunctionalAreaOverviewFromCountsInput {
  scopeItems: ScopeItemInput[];
  responseCounts: StepResponseCountInput[];
  gapResolutionCounts: GapResolutionCountInput[];
}

interface ScopeStatusCounts {
  responded: number;
  fit: number;
  configure: number;
  gap: number;
}

function buildOverview(
  scopeItems: ScopeItemInput[],
  responseStatsByScope: Map<string, ScopeStatusCounts>,
  resolutionsByScope: Map<string, string[]>,
  resolutionCountsByScope?: Map<string, Record<string, number>>,
): FunctionalAreaOverviewData[] {
  if (scopeItems.length === 0) return [];

  const areaMap = new Map<string, FunctionalAreaOverviewData>();
  const areaResolutionTypes = new Map<string, string[]>();
  const areaResolutionCounts = new Map<string, Record<string, number>>();

  for (const scopeItem of scopeItems) {
    const area = scopeItem.functionalArea;
    if (!areaMap.has(area)) {
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

    const areaData = areaMap.get(area)!;
    const scopeCounts = responseStatsByScope.get(scopeItem.id) ?? {
      responded: 0,
      fit: 0,
      configure: 0,
      gap: 0,
    };
    const pendingCount = Math.max(0, scopeItem.totalSteps - scopeCounts.responded);
    const completionPct = scopeItem.totalSteps > 0
      ? Math.round((scopeCounts.responded / scopeItem.totalSteps) * 100)
      : 0;

    areaData.totalScopeItems += 1;
    areaData.selectedCount += 1;
    areaData.fitCount += scopeCounts.fit;
    areaData.configureCount += scopeCounts.configure;
    areaData.gapCount += scopeCounts.gap;
    areaData.pendingCount += pendingCount;
    areaData.scopeItems.push({
      scopeItemId: scopeItem.id,
      scopeItemName: scopeItem.nameClean,
      totalSteps: scopeItem.totalSteps,
      fitCount: scopeCounts.fit,
      configureCount: scopeCounts.configure,
      gapCount: scopeCounts.gap,
      pendingCount,
      completionPct,
    });

    const scopeResolutions = resolutionsByScope.get(scopeItem.id);
    if (scopeResolutions && scopeResolutions.length > 0) {
      const existing = areaResolutionTypes.get(area);
      if (existing) {
        existing.push(...scopeResolutions);
      } else {
        areaResolutionTypes.set(area, [...scopeResolutions]);
      }
    }

    if (resolutionCountsByScope) {
      const scopeResolutionCounts = resolutionCountsByScope.get(scopeItem.id);
      if (scopeResolutionCounts) {
        const existing = areaResolutionCounts.get(area) ?? {};
        for (const [resolutionType, count] of Object.entries(scopeResolutionCounts)) {
          existing[resolutionType] = (existing[resolutionType] ?? 0) + count;
        }
        areaResolutionCounts.set(area, existing);
      }
    }
  }

  for (const areaData of areaMap.values()) {
    const totalSteps = areaData.scopeItems.reduce((sum, item) => sum + item.totalSteps, 0);
    const totalResponded = areaData.fitCount + areaData.configureCount + areaData.gapCount;
    areaData.completionPct = totalSteps > 0
      ? Math.round((totalResponded / totalSteps) * 100)
      : 0;

    if (resolutionCountsByScope) {
      areaData.riskScore = computeRiskScoreFromResolutionCounts(
        totalSteps,
        areaData.gapCount,
        areaData.pendingCount,
        areaResolutionCounts.get(areaData.functionalArea) ?? {},
      );
    } else {
      areaData.riskScore = computeRiskScore(
        totalSteps,
        areaData.gapCount,
        areaData.pendingCount,
        areaResolutionTypes.get(areaData.functionalArea) ?? [],
      );
    }
  }

  return [...areaMap.values()].sort((a, b) =>
    a.functionalArea.localeCompare(b.functionalArea),
  );
}

/**
 * Build functional-area overview data in O(n) over each dataset.
 * This avoids repeated filter/find scans that degrade on large assessments.
 */
export function buildFunctionalAreaOverview(
  input: BuildFunctionalAreaOverviewInput,
): FunctionalAreaOverviewData[] {
  if (input.scopeItems.length === 0) return [];

  const validScopeIds = new Set(input.scopeItems.map((si) => si.id));

  const responseStatsByScope = new Map<string, ScopeStatusCounts>();
  for (const response of input.stepResponses) {
    const scopeItemId = response.processStep.scopeItemId;
    if (!validScopeIds.has(scopeItemId)) continue;

    const counts = responseStatsByScope.get(scopeItemId) ?? {
      responded: 0,
      fit: 0,
      configure: 0,
      gap: 0,
    };
    counts.responded += 1;

    switch (response.fitStatus) {
      case "FIT":
        counts.fit += 1;
        break;
      case "CONFIGURE":
        counts.configure += 1;
        break;
      case "GAP":
        counts.gap += 1;
        break;
      default:
        break;
    }

    responseStatsByScope.set(scopeItemId, counts);
  }

  const resolutionsByScope = new Map<string, string[]>();
  for (const resolution of input.gapResolutions) {
    if (!validScopeIds.has(resolution.scopeItemId)) continue;
    const existing = resolutionsByScope.get(resolution.scopeItemId);
    if (existing) {
      existing.push(resolution.resolutionType);
    } else {
      resolutionsByScope.set(resolution.scopeItemId, [resolution.resolutionType]);
    }
  }

  return buildOverview(
    input.scopeItems,
    responseStatsByScope,
    resolutionsByScope,
  );
}

/**
 * Build functional-area overview data from aggregated DB counts.
 * Use this on large assessments to avoid materializing every response row.
 */
export function buildFunctionalAreaOverviewFromCounts(
  input: BuildFunctionalAreaOverviewFromCountsInput,
): FunctionalAreaOverviewData[] {
  if (input.scopeItems.length === 0) return [];

  const validScopeIds = new Set(input.scopeItems.map((scopeItem) => scopeItem.id));

  const responseStatsByScope = new Map<string, ScopeStatusCounts>();
  for (const responseCount of input.responseCounts) {
    if (!validScopeIds.has(responseCount.scopeItemId)) continue;

    const stats = responseStatsByScope.get(responseCount.scopeItemId) ?? {
      responded: 0,
      fit: 0,
      configure: 0,
      gap: 0,
    };
    stats.responded += responseCount.count;
    switch (responseCount.fitStatus) {
      case "FIT":
        stats.fit += responseCount.count;
        break;
      case "CONFIGURE":
        stats.configure += responseCount.count;
        break;
      case "GAP":
        stats.gap += responseCount.count;
        break;
      default:
        break;
    }
    responseStatsByScope.set(responseCount.scopeItemId, stats);
  }

  const resolutionsByScope = new Map<string, string[]>();
  const resolutionCountsByScope = new Map<string, Record<string, number>>();
  for (const resolutionCount of input.gapResolutionCounts) {
    if (!validScopeIds.has(resolutionCount.scopeItemId)) continue;

    const resolutionCounts = resolutionCountsByScope.get(resolutionCount.scopeItemId) ?? {};
    resolutionCounts[resolutionCount.resolutionType] =
      (resolutionCounts[resolutionCount.resolutionType] ?? 0) + resolutionCount.count;
    resolutionCountsByScope.set(resolutionCount.scopeItemId, resolutionCounts);

    // Keep the lightweight string-array map populated for compatibility with existing rendering assumptions.
    const existing = resolutionsByScope.get(resolutionCount.scopeItemId) ?? [];
    if (resolutionCount.count > 0) existing.push(resolutionCount.resolutionType);
    resolutionsByScope.set(resolutionCount.scopeItemId, existing);
  }

  return buildOverview(
    input.scopeItems,
    responseStatsByScope,
    resolutionsByScope,
    resolutionCountsByScope,
  );
}
