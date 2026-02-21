/** Phase 26: Scope delta computation for cross-phase analytics */

import type { ScopeDelta, ClassificationDelta } from "@/types/analytics";

/**
 * Compute the scope delta between two phases of an assessment.
 * Identifies added, removed, and changed scope items.
 */
export function computeScopeDelta(
  phase1: Array<{ scopeItemId: string; relevance: string }>,
  phase2: Array<{ scopeItemId: string; relevance: string }>,
): ScopeDelta {
  const phase1Map = new Map(phase1.map((s) => [s.scopeItemId, s.relevance]));
  const phase2Map = new Map(phase2.map((s) => [s.scopeItemId, s.relevance]));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ scopeItemId: string; from: string; to: string }> = [];

  // Items in phase2 but not in phase1
  for (const [scopeItemId, relevance] of phase2Map) {
    if (!phase1Map.has(scopeItemId)) {
      added.push(scopeItemId);
    } else {
      const phase1Relevance = phase1Map.get(scopeItemId);
      if (phase1Relevance !== relevance) {
        changed.push({
          scopeItemId,
          from: phase1Relevance ?? "",
          to: relevance,
        });
      }
    }
  }

  // Items in phase1 but not in phase2
  for (const [scopeItemId] of phase1Map) {
    if (!phase2Map.has(scopeItemId)) {
      removed.push(scopeItemId);
    }
  }

  return { added, removed, changed };
}

/**
 * Compute classification changes between two phases.
 * Tracks how step responses changed from one phase to another.
 */
export function computeClassificationDelta(
  phase1Responses: Array<{ processStepId: string; fitStatus: string }>,
  phase2Responses: Array<{ processStepId: string; fitStatus: string }>,
): ClassificationDelta {
  const phase1Map = new Map(
    phase1Responses.map((r) => [r.processStepId, r.fitStatus.toUpperCase()]),
  );
  const phase2Map = new Map(
    phase2Responses.map((r) => [r.processStepId, r.fitStatus.toUpperCase()]),
  );

  let fitToGap = 0;
  let gapToFit = 0;
  let fitToConfig = 0;
  let configToFit = 0;
  let newItems = 0;
  let removedItems = 0;

  // Check changes from phase1 to phase2
  for (const [stepId, status1] of phase1Map) {
    const status2 = phase2Map.get(stepId);
    if (status2 == null) {
      removedItems++;
      continue;
    }
    if (status1 === "FIT" && status2 === "GAP") fitToGap++;
    if (status1 === "GAP" && status2 === "FIT") gapToFit++;
    if (status1 === "FIT" && status2 === "CONFIGURE") fitToConfig++;
    if (status1 === "CONFIGURE" && status2 === "FIT") configToFit++;
  }

  // Items in phase2 not in phase1
  for (const [stepId] of phase2Map) {
    if (!phase1Map.has(stepId)) {
      newItems++;
    }
  }

  return {
    fitToGap,
    gapToFit,
    fitToConfig,
    configToFit,
    newItems,
    removedItems,
  };
}

/**
 * Generate human-readable trend insight strings from delta data.
 */
export function generateTrendInsights(
  scopeDelta: ScopeDelta,
  classificationDelta: ClassificationDelta,
  phase1FitRate: number,
  phase2FitRate: number,
): string[] {
  const insights: string[] = [];
  const fitRateChange = phase2FitRate - phase1FitRate;

  if (fitRateChange > 0) {
    insights.push(
      `FIT rate improved by ${fitRateChange.toFixed(1)} percentage points.`,
    );
  } else if (fitRateChange < 0) {
    insights.push(
      `FIT rate decreased by ${Math.abs(fitRateChange).toFixed(1)} percentage points.`,
    );
  } else {
    insights.push("FIT rate remained unchanged between phases.");
  }

  if (scopeDelta.added.length > 0) {
    insights.push(
      `${scopeDelta.added.length} scope item(s) were added in the second phase.`,
    );
  }

  if (scopeDelta.removed.length > 0) {
    insights.push(
      `${scopeDelta.removed.length} scope item(s) were removed in the second phase.`,
    );
  }

  if (scopeDelta.changed.length > 0) {
    insights.push(
      `${scopeDelta.changed.length} scope item(s) had relevance changes.`,
    );
  }

  if (classificationDelta.gapToFit > 0) {
    insights.push(
      `${classificationDelta.gapToFit} step(s) improved from GAP to FIT.`,
    );
  }

  if (classificationDelta.fitToGap > 0) {
    insights.push(
      `${classificationDelta.fitToGap} step(s) regressed from FIT to GAP.`,
    );
  }

  return insights;
}
