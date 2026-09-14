/** Phase 26: Benchmark computation engine */

import {
  BENCHMARK_SOURCE_LABEL,
  MINIMUM_BENCHMARK_SAMPLE_SIZE,
  type BenchmarkPosition,
} from "@/types/analytics";

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
 * Compare an assessment's FIT rate against a cohort of ABeam engagements.
 *
 * Returns null rather than a position when the comparison cannot be made
 * honestly. Two cases, both of which used to return a confident answer:
 *
 *   1. The cohort is smaller than MINIMUM_BENCHMARK_SAMPLE_SIZE. nightly-job.ts
 *      writes a snapshot for a cohort of any size and defers suppression to the
 *      consumer; this is that suppression.
 *   2. The cohort has no p25/p75. Without a distribution there is no position to
 *      report. This previously fell back to "average plus or minus 5 points",
 *      a threshold with no basis in the data, which manufactured
 *      above_average/below_average verdicts out of an arithmetic mean.
 *
 * A caller that gets null must say the comparison is unavailable. It must not
 * substitute a delta, a direction or a hedge.
 */
export function computeBenchmarkComparison(
  assessmentFitRate: number,
  benchmark: {
    avgFitRate: number;
    p25FitRate?: number | null | undefined;
    p75FitRate?: number | null | undefined;
    sampleSize: number;
  },
): { fitRateDelta: number; fitRatePercentile: BenchmarkPosition } | null {
  if (benchmark.sampleSize < MINIMUM_BENCHMARK_SAMPLE_SIZE) return null;

  const p75 = benchmark.p75FitRate ?? null;
  const p25 = benchmark.p25FitRate ?? null;
  if (p25 == null || p75 == null) return null;

  const fitRateDelta = assessmentFitRate - benchmark.avgFitRate;

  let fitRatePercentile: BenchmarkPosition = "average";
  if (assessmentFitRate > p75) {
    fitRatePercentile = "above_average";
  } else if (assessmentFitRate < p25) {
    fitRatePercentile = "below_average";
  }

  return {
    fitRateDelta: Math.round(fitRateDelta * 100) / 100,
    fitRatePercentile,
  };
}

/**
 * Human-readable insight strings for a comparison.
 *
 * Every line that carries a number also carries where the number came from.
 * The comparison set is ABeam's own engagement records, so these lines say so:
 * "comparable ABeam engagements", never "the industry average". The old wording
 * described a peer panel this product has never had, and it was one
 * copy-and-paste away from a client proposal citing an industry benchmark that
 * does not exist.
 *
 * When the comparison is suppressed the return is a single line saying so.
 * There is no partial answer: a reader who sees a number here is entitled to
 * assume the cohort met the threshold.
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
  const comparison = computeBenchmarkComparison(assessmentFitRate, benchmark);

  if (!comparison) {
    return [
      `Not enough comparable engagements to place this assessment. ` +
        `${benchmark.sampleSize} recorded; at least ${MINIMUM_BENCHMARK_SAMPLE_SIZE} are needed before a position is shown.`,
    ];
  }

  const { fitRateDelta, fitRatePercentile } = comparison;
  const cohort = `${benchmark.sampleSize} comparable ABeam engagements`;
  const insights: string[] = [];

  if (fitRatePercentile === "above_average") {
    insights.push(
      `This assessment's FIT rate of ${assessmentFitRate.toFixed(1)}% sits above the upper quartile of ${cohort} (their mean: ${benchmark.avgFitRate.toFixed(1)}%).`,
    );
  } else if (fitRatePercentile === "below_average") {
    insights.push(
      `This assessment's FIT rate of ${assessmentFitRate.toFixed(1)}% sits below the lower quartile of ${cohort} (their mean: ${benchmark.avgFitRate.toFixed(1)}%). Consider reviewing gap resolutions.`,
    );
  } else {
    insights.push(
      `This assessment's FIT rate of ${assessmentFitRate.toFixed(1)}% sits within the middle two quartiles of ${cohort} (their mean: ${benchmark.avgFitRate.toFixed(1)}%).`,
    );
  }

  if (fitRateDelta > 0) {
    insights.push(
      `${fitRateDelta.toFixed(1)} percentage points above the mean of ${cohort}.`,
    );
  } else if (fitRateDelta < 0) {
    insights.push(
      `${Math.abs(fitRateDelta).toFixed(1)} percentage points below the mean of ${cohort}.`,
    );
  }

  insights.push(`Comparison set: ${BENCHMARK_SOURCE_LABEL}.`);

  return insights;
}
