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

export const MINIMUM_BENCHMARK_SAMPLE_SIZE = 5;
