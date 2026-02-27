/** Hierarchy types — structured process tree from extracted entities */

export interface HierarchyTree {
  scopeItemId: string;
  scopeItemName: string;
  processes: ProcessNode[];
}

export interface ProcessNode {
  id: string;
  name: string;
  guid: string | null;
  sequence: number;
  flows: FlowNode[];
}

export interface FlowNode {
  id: string;
  name: string;
  guid: string | null;
  flowDiagramGuid: string | null;
  flowDiagramName: string | null;
  sequence: number;
  activities: ActivityNode[];
}

export interface ActivityNode {
  id: string;
  title: string;
  guid: string | null;
  targetUrl: string | null;
  sequence: number;
  stepCount: number;
  classifiableCount: number;
  reviewedCount: number;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  naCount: number;
  pendingCount: number;
}

export interface ActivityProgress {
  total: number;
  reviewed: number;
  fit: number;
  configure: number;
  gap: number;
  na: number;
  pending: number;
}

export interface ActivityProgressMap {
  [activityId: string]: ActivityProgress;
}
