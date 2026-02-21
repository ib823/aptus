/** Phase 13: Gap cost/risk rollup aggregation — pure function */

import type { CostRollup } from "@/types/assessment";

interface GapForRollup {
  resolutionType: string;
  priority?: string | null;
  riskCategory?: string | null;
  oneTimeCost?: number | null;
  recurringCost?: number | null;
  implementationDays?: number | null;
}

/**
 * Aggregate cost, effort, and risk data across all gaps.
 * Pure function — no DB access.
 */
export function calculateGapRollups(gaps: GapForRollup[]): CostRollup {
  const result: CostRollup = {
    totalOneTimeCost: 0,
    totalRecurringCost: 0,
    totalImplementationDays: 0,
    byResolutionType: {},
    byRiskCategory: {},
    byPriority: {},
  };

  for (const gap of gaps) {
    const oneTime = gap.oneTimeCost ?? 0;
    const recurring = gap.recurringCost ?? 0;
    const days = gap.implementationDays ?? 0;

    result.totalOneTimeCost += oneTime;
    result.totalRecurringCost += recurring;
    result.totalImplementationDays += days;

    // Group by resolution type
    const rt = gap.resolutionType;
    if (!result.byResolutionType[rt]) {
      result.byResolutionType[rt] = { oneTime: 0, recurring: 0, days: 0 };
    }
    result.byResolutionType[rt]!.oneTime += oneTime;
    result.byResolutionType[rt]!.recurring += recurring;
    result.byResolutionType[rt]!.days += days;

    // Group by risk category
    if (gap.riskCategory) {
      const rc = gap.riskCategory;
      if (!result.byRiskCategory[rc]) {
        result.byRiskCategory[rc] = { oneTime: 0, recurring: 0, count: 0 };
      }
      result.byRiskCategory[rc]!.oneTime += oneTime;
      result.byRiskCategory[rc]!.recurring += recurring;
      result.byRiskCategory[rc]!.count++;
    }

    // Group by priority
    if (gap.priority) {
      const p = gap.priority;
      if (!result.byPriority[p]) {
        result.byPriority[p] = { oneTime: 0, recurring: 0, count: 0 };
      }
      result.byPriority[p]!.oneTime += oneTime;
      result.byPriority[p]!.recurring += recurring;
      result.byPriority[p]!.count++;
    }
  }

  return result;
}
