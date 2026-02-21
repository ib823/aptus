/** Phase 26: Benchmark computation engine */

import type { BenchmarkPosition } from "@/types/analytics";

/**
 * Compute the arithmetic mean of an array of numbers.
 * Returns 0 for empty arrays.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/**
 * Compute the median of a sorted array of numbers.
 * The input MUST be pre-sorted in ascending order.
 * Returns 0 for empty arrays.
 */
export function median(sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return ((sortedValues[mid - 1] ?? 0) + (sortedValues[mid] ?? 0)) / 2;
  }
  return sortedValues[mid] ?? 0;
}

/**
 * Compute the p-th percentile of a sorted array of numbers.
 * Uses linear interpolation. The input MUST be pre-sorted.
 * @param p - Percentile value between 0 and 100.
 * Returns 0 for empty arrays.
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0] ?? 0;

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  const lowerVal = sortedValues[lower] ?? 0;
  const upperVal = sortedValues[upper] ?? 0;

  return lowerVal + fraction * (upperVal - lowerVal);
}

/**
 * Compute the FIT rate as a percentage from an array of step responses.
 * FIT rate = (count of fitStatus === "fit" (case-insensitive)) / total * 100
 * Returns 0 for empty arrays.
 */
export function computeFitRate(
  responses: Array<{ fitStatus: string }>,
): number {
  if (responses.length === 0) return 0;
  const fitCount = responses.filter(
    (r) => r.fitStatus.toUpperCase() === "FIT",
  ).length;
  return (fitCount / responses.length) * 100;
}

/**
 * Compare an assessment's FIT rate against a benchmark.
 * Returns the delta and position relative to the benchmark distribution.
 */
export function computeBenchmarkComparison(
  assessmentFitRate: number,
  benchmark: {
    avgFitRate: number;
    p25FitRate?: number | null | undefined;
    p75FitRate?: number | null | undefined;
  },
): { fitRateDelta: number; fitRatePercentile: BenchmarkPosition } {
  const fitRateDelta = assessmentFitRate - benchmark.avgFitRate;

  let fitRatePercentile: BenchmarkPosition = "average";

  const p75 = benchmark.p75FitRate ?? null;
  const p25 = benchmark.p25FitRate ?? null;

  if (p75 != null && assessmentFitRate > p75) {
    fitRatePercentile = "above_average";
  } else if (p25 != null && assessmentFitRate < p25) {
    fitRatePercentile = "below_average";
  } else if (p75 == null && p25 == null) {
    // Fallback: use avg +/- 5% threshold when percentiles are not available
    if (fitRateDelta > 5) {
      fitRatePercentile = "above_average";
    } else if (fitRateDelta < -5) {
      fitRatePercentile = "below_average";
    }
  }

  return {
    fitRateDelta: Math.round(fitRateDelta * 100) / 100,
    fitRatePercentile,
  };
}

/**
 * Generate human-readable insight strings comparing an assessment to a benchmark.
 */
export function generateInsights(
  assessmentFitRate: number,
  benchmark: {
    avgFitRate: number;
    p25FitRate?: number | null | undefined;
    p75FitRate?: number | null | undefined;
    sampleSize: number;
  },
): string[] {
  const insights: string[] = [];
  const { fitRateDelta, fitRatePercentile } = computeBenchmarkComparison(
    assessmentFitRate,
    benchmark,
  );

  if (fitRatePercentile === "above_average") {
    insights.push(
      `Your FIT rate of ${assessmentFitRate.toFixed(1)}% is above average (benchmark: ${benchmark.avgFitRate.toFixed(1)}%).`,
    );
  } else if (fitRatePercentile === "below_average") {
    insights.push(
      `Your FIT rate of ${assessmentFitRate.toFixed(1)}% is below average (benchmark: ${benchmark.avgFitRate.toFixed(1)}%). Consider reviewing gap resolutions.`,
    );
  } else {
    insights.push(
      `Your FIT rate of ${assessmentFitRate.toFixed(1)}% is in line with the industry average of ${benchmark.avgFitRate.toFixed(1)}%.`,
    );
  }

  insights.push(
    `Based on ${benchmark.sampleSize} assessments in this industry.`,
  );

  if (fitRateDelta > 0) {
    insights.push(
      `${fitRateDelta.toFixed(1)} percentage points above the industry average.`,
    );
  } else if (fitRateDelta < 0) {
    insights.push(
      `${Math.abs(fitRateDelta).toFixed(1)} percentage points below the industry average.`,
    );
  }

  return insights;
}
