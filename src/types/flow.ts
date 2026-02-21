/** Phase 20: Process Visualization types */

/** Position on the canvas */
export interface FlowPosition {
  x: number;
  y: number;
}

/** A single node in an interactive flow diagram */
export interface FlowNode {
  id: string;
  label: string;
  fitStatus: string;
  position: FlowPosition;
  width: number;
  height: number;
  stepSequence: number;
  scopeItemId: string;
  processStepId: string;
  actionTitle: string;
  clientNote?: string | undefined;
}

/** An edge connecting two nodes */
export interface FlowEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

/** Interactive flow data stored as JSON */
export interface InteractiveFlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewBox: { width: number; height: number };
  layoutVersion: number;
}

/** Summary of scope items in a functional area */
export interface AreaScopeItemSummary {
  scopeItemId: string;
  scopeItemName: string;
  totalSteps: number;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  pendingCount: number;
  completionPct: number;
}

/** Cross-area dependency */
export interface CrossAreaDep {
  fromArea: string;
  toArea: string;
  scopeItemId: string;
  reason: string;
}

/** Functional area overview data */
export interface FunctionalAreaOverviewData {
  functionalArea: string;
  totalScopeItems: number;
  selectedCount: number;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  pendingCount: number;
  riskScore: number;
  completionPct: number;
  crossAreaDeps: string[];
  scopeItems: AreaScopeItemSummary[];
}
