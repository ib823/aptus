/** Phase 20: Per-node risk overlay computation */

import type { RiskOverlayEntry } from "@/types/flow";

interface StepRiskInput {
  processStepId: string;
  fitStatus: string;
  hasResolution: boolean;
  resolutionComplexity?: number | undefined;
}

/**
 * Compute a per-node risk score for each step.
 *
 * Risk scoring:
 *   FIT:       0.0
 *   CONFIGURE: 0.2
 *   GAP with resolution:    0.3 + (0.1 * complexity factor)
 *   GAP without resolution: 0.8
 *   PENDING:   0.5
 *   NA:        0.0
 */
export function computeRiskOverlay(steps: StepRiskInput[]): RiskOverlayEntry[] {
  return steps.map((step) => {
    let riskScore: number;
    switch (step.fitStatus) {
      case "FIT":
        riskScore = 0.0;
        break;
      case "NA":
        riskScore = 0.0;
        break;
      case "CONFIGURE":
        riskScore = 0.2;
        break;
      case "GAP":
        if (step.hasResolution) {
          const complexity = step.resolutionComplexity ?? 0.5;
          riskScore = 0.3 + 0.1 * Math.min(complexity, 1.0);
        } else {
          riskScore = 0.8;
        }
        break;
      default:
        // PENDING or unknown
        riskScore = 0.5;
        break;
    }

    return {
      nodeId: step.processStepId,
      riskScore: Math.round(riskScore * 1000) / 1000,
    };
  });
}
