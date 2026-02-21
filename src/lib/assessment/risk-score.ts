/** Phase 20: Risk score computation */

/**
 * Resolution type complexity weights for risk scoring.
 */
const COMPLEXITY_WEIGHTS: Record<string, number> = {
  CUSTOM_ABAP: 1.0,
  BTP_EXT: 0.8,
  ISV: 0.6,
  ADAPT_PROCESS: 0.4,
  KEY_USER_EXT: 0.3,
  OUT_OF_SCOPE: 0.2,
  CONFIGURE: 0.1,
  FIT: 0,
};

/**
 * Compute a risk score between 0.0 and 1.0 for a set of process steps.
 *
 * Formula:
 *   riskScore = gapDensity * 0.4
 *             + unresolvedRatio * 0.3
 *             + avgComplexity * 0.2
 *             + pendingRatio * 0.1
 *
 * @param totalSteps   Total number of process steps
 * @param gapCount     Number of steps classified as GAP
 * @param pendingCount Number of steps still PENDING
 * @param resolutions  Array of resolution type strings for gap items
 * @returns Risk score clamped to [0.0, 1.0]
 */
export function computeRiskScore(
  totalSteps: number,
  gapCount: number,
  pendingCount: number,
  resolutions: string[],
): number {
  if (totalSteps === 0) return 0;

  // Gap density: proportion of steps that are gaps
  const gapDensity = gapCount / totalSteps;

  // Unresolved ratio: gaps without a resolution
  const unresolvedRatio = gapCount > 0
    ? Math.max(0, gapCount - resolutions.length) / gapCount
    : 0;

  // Average complexity of resolutions
  let avgComplexity = 0;
  if (resolutions.length > 0) {
    const totalWeight = resolutions.reduce((sum, r) => {
      return sum + (COMPLEXITY_WEIGHTS[r] ?? 0.5);
    }, 0);
    avgComplexity = totalWeight / resolutions.length;
  }

  // Pending ratio: proportion of steps still pending
  const pendingRatio = pendingCount / totalSteps;

  // Weighted score
  const raw =
    gapDensity * 0.4 +
    unresolvedRatio * 0.3 +
    avgComplexity * 0.2 +
    pendingRatio * 0.1;

  // Clamp to [0, 1]
  return Math.min(1, Math.max(0, Math.round(raw * 1000) / 1000));
}
