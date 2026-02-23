/** Phase 20: Thumbnail SVG generator */

import {
  computeSequentialLayout,
  generateThumbnailSvg as generateSvg,
  type LayoutStep,
} from "@/lib/assessment/flow-layout";
import type { StepWithResponse } from "./interactive-flow";

/**
 * Generate a simplified thumbnail SVG (< 10KB) for a set of steps.
 * Returns SVG string.
 */
export function generateThumbnailSvg(steps: StepWithResponse[]): string {
  const layoutSteps: LayoutStep[] = steps.map((s) => ({
    id: s.id,
    sequence: s.sequence,
    actionTitle: s.actionTitle,
    fitStatus: s.fitStatus,
    scopeItemId: s.scopeItemId,
    processStepId: s.id,
    clientNote: s.clientNote,
  }));

  const layout = computeSequentialLayout(layoutSteps);
  return generateSvg(layoutSteps, layout);
}
