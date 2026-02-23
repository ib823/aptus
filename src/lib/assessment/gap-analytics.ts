/** Phase 13: Gap analytics — cost rollup, risk heatmap, upgrade impact */

const RISK_CATEGORIES = ["technical", "business", "compliance", "integration"] as const;
const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

// Resolution types that produce upgrade-unsafe code
const UPGRADE_UNSAFE_TYPES = new Set(["CUSTOM_ABAP", "ISV"]);
const UPGRADE_REVALIDATION_TYPES = new Set(["BTP_EXT", "KEY_USER_EXT"]);

// --- Interfaces ---

export interface CostRollupV2 {
  totalOneTimeCost: number;
  totalRecurringCost: number;
  totalImplementationDays: number;
  byCurrency: Record<string, { oneTime: number; recurring: number; days: number }>;
  byResolutionType: Record<string, { count: number; oneTime: number; recurring: number; days: number }>;
}

export interface RiskHeatMap {
  cells: Array<{
    category: string;
    level: string;
    count: number;
    gapIds: string[];
  }>;
  totalCategorized: number;
  totalUncategorized: number;
}

export interface UpgradeImpactSummary {
  upgradeUnsafeCount: number;
  upgradeStrategyCounts: Record<string, number>;
  upgradeUnsafeResolutions: Array<{
    gapId: string;
    resolutionType: string;
    upgradeStrategy: string;
    description: string;
  }>;
}

interface GapForAnalytics {
  id: string;
  resolutionType: string;
  resolutionDescription?: string | null;
  oneTimeCost?: number | null;
  recurringCost?: number | null;
  costCurrency?: string | null;
  implementationDays?: number | null;
  riskLevel?: string | null;
  riskCategory?: string | null;
  upgradeStrategy?: string | null;
}

// --- Cost Rollup ---

/**
 * Compute cost rollup across all resolved gaps.
 * Excludes PENDING gaps (no resolution set).
 * Groups by currency for multi-currency support.
 */
export function computeCostRollup(gaps: GapForAnalytics[]): CostRollupV2 {
  const result: CostRollupV2 = {
    totalOneTimeCost: 0,
    totalRecurringCost: 0,
    totalImplementationDays: 0,
    byCurrency: {},
    byResolutionType: {},
  };

  for (const gap of gaps) {
    if (gap.resolutionType === "PENDING") continue;

    const oneTime = gap.oneTimeCost ?? 0;
    const recurring = gap.recurringCost ?? 0;
    const days = gap.implementationDays ?? 0;
    const currency = gap.costCurrency ?? "USD";

    // Totals (primary currency assumed USD)
    result.totalOneTimeCost += oneTime;
    result.totalRecurringCost += recurring;
    result.totalImplementationDays += days;

    // By currency
    if (!result.byCurrency[currency]) {
      result.byCurrency[currency] = { oneTime: 0, recurring: 0, days: 0 };
    }
    result.byCurrency[currency].oneTime += oneTime;
    result.byCurrency[currency].recurring += recurring;
    result.byCurrency[currency].days += days;

    // By resolution type
    const rt = gap.resolutionType;
    if (!result.byResolutionType[rt]) {
      result.byResolutionType[rt] = { count: 0, oneTime: 0, recurring: 0, days: 0 };
    }
    result.byResolutionType[rt].count++;
    result.byResolutionType[rt].oneTime += oneTime;
    result.byResolutionType[rt].recurring += recurring;
    result.byResolutionType[rt].days += days;
  }

  return result;
}

// --- Risk Heat Map ---

/**
 * Compute a 4×3 risk heat map (category × level).
 * Returns 12 cells with gap counts and IDs.
 */
export function computeRiskHeatMap(gaps: GapForAnalytics[]): RiskHeatMap {
  const cellMap = new Map<string, { count: number; gapIds: string[] }>();

  // Initialize all 12 cells
  for (const category of RISK_CATEGORIES) {
    for (const level of RISK_LEVELS) {
      cellMap.set(`${category}:${level}`, { count: 0, gapIds: [] });
    }
  }

  let totalCategorized = 0;
  let totalUncategorized = 0;

  for (const gap of gaps) {
    if (gap.riskCategory && gap.riskLevel) {
      const key = `${gap.riskCategory}:${gap.riskLevel}`;
      const cell = cellMap.get(key);
      if (cell) {
        cell.count++;
        cell.gapIds.push(gap.id);
        totalCategorized++;
      } else {
        totalUncategorized++;
      }
    } else {
      totalUncategorized++;
    }
  }

  const cells: RiskHeatMap["cells"] = [];
  for (const category of RISK_CATEGORIES) {
    for (const level of RISK_LEVELS) {
      const cell = cellMap.get(`${category}:${level}`)!;
      cells.push({
        category,
        level,
        count: cell.count,
        gapIds: cell.gapIds,
      });
    }
  }

  return { cells, totalCategorized, totalUncategorized };
}

// --- Upgrade Impact Analysis ---

/**
 * Infer upgrade strategy from resolution type when not explicitly set.
 */
function inferUpgradeStrategy(resolutionType: string): string {
  if (UPGRADE_UNSAFE_TYPES.has(resolutionType)) return "custom_maintenance";
  if (UPGRADE_REVALIDATION_TYPES.has(resolutionType)) return "needs_revalidation";
  return "standard_upgrade";
}

/**
 * Analyze upgrade impact across all resolved gaps.
 * Uses explicit upgradeStrategy if set, otherwise infers from resolutionType.
 */
export function analyzeUpgradeImpact(gaps: GapForAnalytics[]): UpgradeImpactSummary {
  const upgradeStrategyCounts: Record<string, number> = {};
  const upgradeUnsafeResolutions: UpgradeImpactSummary["upgradeUnsafeResolutions"] = [];

  for (const gap of gaps) {
    if (gap.resolutionType === "PENDING") continue;

    const strategy = gap.upgradeStrategy ?? inferUpgradeStrategy(gap.resolutionType);

    upgradeStrategyCounts[strategy] = (upgradeStrategyCounts[strategy] ?? 0) + 1;

    if (strategy === "custom_maintenance") {
      upgradeUnsafeResolutions.push({
        gapId: gap.id,
        resolutionType: gap.resolutionType,
        upgradeStrategy: strategy,
        description: gap.resolutionDescription ?? gap.resolutionType,
      });
    }
  }

  return {
    upgradeUnsafeCount: upgradeUnsafeResolutions.length,
    upgradeStrategyCounts,
    upgradeUnsafeResolutions,
  };
}
