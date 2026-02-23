/** Phase 20: Generate InteractiveFlowData for a scope item */

import { computeSequentialLayout, type LayoutStep } from "@/lib/assessment/flow-layout";
import type { InteractiveFlowData } from "@/types/flow";

export interface StepWithResponse {
  id: string;
  sequence: number;
  actionTitle: string;
  scopeItemId: string;
  fitStatus: string;
  clientNote?: string | undefined;
}

/**
 * Generate InteractiveFlowData from steps + responses.
 * Wraps computeSequentialLayout and produces the full interactive payload.
 */
export function generateInteractiveFlowData(
  steps: StepWithResponse[],
): InteractiveFlowData {
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

  return {
    nodes: layout.nodes,
    edges: layout.edges,
    viewBox: layout.viewBox,
    layoutVersion: 1,
  };
}
