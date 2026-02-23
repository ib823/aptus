/** Phase 13: Gap comparison — side-by-side resolution delta analysis */

export interface ComparisonDelta {
  field: string;
  primaryValue: string | number | null;
  alternativeValue: string | number | null;
  delta: number | null;
  winner: "primary" | "alternative" | "tie";
}

interface ResolutionData {
  oneTimeCost?: number | null;
  recurringCost?: number | null;
  implementationDays?: number | null;
  riskLevel?: string | null;
  upgradeStrategy?: string | null;
}

const RISK_LEVEL_ORDER: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

const UPGRADE_STRATEGY_ORDER: Record<string, number> = {
  standard_upgrade: 1,
  needs_revalidation: 2,
  custom_maintenance: 3,
};

/**
 * Compare a primary gap resolution against an alternative.
 * For cost/effort fields: lower is better.
 * For riskLevel: LOW < MEDIUM < HIGH, lower is better.
 * For upgradeStrategy: standard_upgrade is best.
 */
export function computeComparisonDeltas(
  primary: ResolutionData,
  alternative: ResolutionData,
): ComparisonDelta[] {
  const deltas: ComparisonDelta[] = [];

  // Cost and effort comparisons — lower is better
  const numericFields: Array<{ field: string; key: keyof ResolutionData }> = [
    { field: "One-Time Cost", key: "oneTimeCost" },
    { field: "Recurring Cost", key: "recurringCost" },
    { field: "Implementation Days", key: "implementationDays" },
  ];

  for (const { field, key } of numericFields) {
    const pVal = primary[key] as number | null | undefined;
    const aVal = alternative[key] as number | null | undefined;
    const p = pVal ?? null;
    const a = aVal ?? null;

    let delta: number | null = null;
    let winner: ComparisonDelta["winner"] = "tie";

    if (p != null && a != null) {
      delta = a - p;
      if (a < p) winner = "alternative";
      else if (p < a) winner = "primary";
    } else if (p == null && a != null) {
      winner = "primary"; // Unknown primary could be zero
    } else if (p != null && a == null) {
      winner = "alternative";
    }

    deltas.push({ field, primaryValue: p, alternativeValue: a, delta, winner });
  }

  // Risk level comparison — lower is better
  {
    const pRisk = (primary.riskLevel ?? null) as string | null;
    const aRisk = (alternative.riskLevel ?? null) as string | null;
    let winner: ComparisonDelta["winner"] = "tie";

    if (pRisk && aRisk) {
      const pOrd = RISK_LEVEL_ORDER[pRisk] ?? 0;
      const aOrd = RISK_LEVEL_ORDER[aRisk] ?? 0;
      if (aOrd < pOrd) winner = "alternative";
      else if (pOrd < aOrd) winner = "primary";
    }

    deltas.push({
      field: "Risk Level",
      primaryValue: pRisk,
      alternativeValue: aRisk,
      delta: null,
      winner,
    });
  }

  // Upgrade strategy comparison — standard_upgrade is best
  {
    const pStrat = (primary.upgradeStrategy ?? null) as string | null;
    const aStrat = (alternative.upgradeStrategy ?? null) as string | null;
    let winner: ComparisonDelta["winner"] = "tie";

    if (pStrat && aStrat) {
      const pOrd = UPGRADE_STRATEGY_ORDER[pStrat] ?? 0;
      const aOrd = UPGRADE_STRATEGY_ORDER[aStrat] ?? 0;
      if (aOrd < pOrd) winner = "alternative";
      else if (pOrd < aOrd) winner = "primary";
    }

    deltas.push({
      field: "Upgrade Strategy",
      primaryValue: pStrat,
      alternativeValue: aStrat,
      delta: null,
      winner,
    });
  }

  return deltas;
}
