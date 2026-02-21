/** Web Vitals performance utilities (Phase 27) */

/** Thresholds for "good" and "needs-improvement" ratings per metric. */
const THRESHOLDS: Record<string, { good: number; needsImprovement: number }> = {
  LCP: { good: 2500, needsImprovement: 4000 },
  FID: { good: 100, needsImprovement: 300 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  INP: { good: 200, needsImprovement: 500 },
  TTFB: { good: 800, needsImprovement: 1800 },
  FCP: { good: 1800, needsImprovement: 3000 },
};

/**
 * Check if a web vital value meets the "good" threshold.
 */
export function isGoodVital(name: string, value: number): boolean {
  const threshold = THRESHOLDS[name];
  if (!threshold) return false;
  return value < threshold.good;
}

/**
 * Return the threshold boundaries for a given web vital metric.
 */
export function getVitalThresholds(name: string): { good: number; needsImprovement: number } {
  const threshold = THRESHOLDS[name];
  if (!threshold) return { good: 0, needsImprovement: 0 };
  return { ...threshold };
}

/**
 * Compute p50, p75, and p95 percentiles from an array of reports.
 * Uses the nearest-rank method.
 */
export function aggregateVitals(
  reports: Array<{ value: number }>,
): { p50: number; p75: number; p95: number } {
  if (reports.length === 0) {
    return { p50: 0, p75: 0, p95: 0 };
  }

  const sorted = reports.map((r) => r.value).sort((a, b) => a - b);

  function percentile(arr: number[], p: number): number {
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)] as number;
  }

  return {
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p95: percentile(sorted, 95),
  };
}
