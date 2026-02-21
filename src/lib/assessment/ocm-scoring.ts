/** Phase 16: OCM readiness scoring and heatmap generation */

const SEVERITY_WEIGHTS: Record<string, number> = {
  TRANSFORMATIONAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/**
 * Calculate severity-weighted average readiness score.
 * TRANSFORMATIONAL=4, HIGH=3, MEDIUM=2, LOW=1
 * Returns 0 if no impacts have a readiness score.
 */
export function calculateWeightedReadiness(
  impacts: { severity: string; readinessScore: number | null }[],
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const impact of impacts) {
    if (impact.readinessScore === null) continue;
    const weight = SEVERITY_WEIGHTS[impact.severity] ?? 1;
    weightedSum += impact.readinessScore * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100) / 100;
}

/**
 * Generate heatmap data by aggregating impacts across role x functional area.
 * Each cell contains the count of impacts, the highest severity, and average readiness.
 */
export function generateHeatmapData(
  impacts: {
    impactedRole: string;
    functionalArea: string | null;
    severity: string;
  }[],
): { role: string; area: string; severity: string; count: number }[] {
  const severityOrder: Record<string, number> = {
    LOW: 0,
    MEDIUM: 1,
    HIGH: 2,
    TRANSFORMATIONAL: 3,
  };

  const cellMap = new Map<string, { role: string; area: string; severity: string; count: number }>();

  for (const impact of impacts) {
    const area = impact.functionalArea ?? "Unassigned";
    const key = `${impact.impactedRole}::${area}`;
    const existing = cellMap.get(key);

    if (!existing) {
      cellMap.set(key, {
        role: impact.impactedRole,
        area,
        severity: impact.severity,
        count: 1,
      });
    } else {
      existing.count++;
      if ((severityOrder[impact.severity] ?? 0) > (severityOrder[existing.severity] ?? 0)) {
        existing.severity = impact.severity;
      }
    }
  }

  return Array.from(cellMap.values());
}
