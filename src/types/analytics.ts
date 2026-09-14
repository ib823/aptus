/** Phase 26: Analytics, Benchmarking & Templates types */

export type MetricType =
  | "fit_rate"
  | "avg_duration"
  | "gap_distribution"
  | "consultant_utilization"
  | "scope_coverage"
  | "assessment_volume";

export type BenchmarkPosition = "above_average" | "average" | "below_average";

export interface PhaseSummary {
  assessmentId: string;
  completedAt: string | null;
  totalSteps: number;
  fitCount: number;
  gapCount: number;
  configCount: number;
  naCount: number;
  fitRate: number;
  scopeItemCount: number;
}

export interface ScopeDelta {
  added: string[];
  removed: string[];
  changed: Array<{ scopeItemId: string; from: string; to: string }>;
}

export interface ClassificationDelta {
  fitToGap: number;
  gapToFit: number;
  fitToConfig: number;
  configToFit: number;
  newItems: number;
  removedItems: number;
}

export interface AnonymizedScopePattern {
  scopeItemId: string;
  relevance: string;
  selected: boolean;
}

export interface AnonymizedGapPattern {
  description: string;
  resolutionType: string;
  frequency: number;
}

/**
 * Below this many qualifying assessments a cohort gets no position, no
 * percentile and no delta. The constant existed from Phase 26 but nothing read
 * it, and nightly-job.ts computes snapshots for cohorts of any size on the
 * stated understanding that the consumer would suppress them ("Compute metrics
 * even for small samples (flag in consumer)"). The consumer never did, so a
 * cohort of two produced a confident "Above Average" badge. It is enforced in
 * computeBenchmarkComparison() and at the API boundary now.
 */
export const MINIMUM_BENCHMARK_SAMPLE_SIZE = 5;

/**
 * What this comparison is actually drawn from, in the words that must appear
 * next to any number taken from it.
 *
 * These are ABeam's own engagement records, filtered to the same industry and
 * company size. They are NOT an external panel, and specifically not APQC Open
 * Standards Benchmarking, which is a separate subscription product this
 * codebase holds no data from. Calling the output an "industry benchmark" is
 * how that distinction gets lost between this screen and a client proposal.
 */
export const BENCHMARK_SOURCE_LABEL =
  "ABeam engagements recorded in Aptus, same industry and company size";
