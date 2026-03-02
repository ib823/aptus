/**
 * Phase: Dependency Engine — Type definitions.
 *
 * All types used by the dependency graph, propagation engine,
 * and UI components for activity dependency management.
 */

import type {
  DependencyType,
  PropagationRule,
} from "@prisma/client";

// Re-export Prisma enums for convenience
export type { DependencyType, PropagationRule, FlowDirection } from "@prisma/client";

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export interface DependencyNode {
  activityId: string;
  activityTitle: string; // Display only — never for matching
  scopeItemCode: string;
  downstream: DependencyEdge[];
  upstream: DependencyEdge[];
}

export interface DependencyEdge {
  dependencyId: string;
  sourceActivityId: string;
  targetActivityId: string;
  type: DependencyType;
  propagationRule: PropagationRule;
  businessReason: string;
}

// ---------------------------------------------------------------------------
// Propagation
// ---------------------------------------------------------------------------

export interface PropagationResult {
  propagations: PropagationAction[];
  warnings: DependencyWarning[];
}

export interface PropagationAction {
  activityId: string;
  activityTitle: string;
  affectedStepIds: string[];
  dependencyId: string;
  businessReason: string;
  propagationType: "AUTO_NA";
}

export interface DependencyWarning {
  activityId: string;
  activityTitle: string;
  scopeItemCode: string;
  warningType: "WARN_SOFT" | "WARN_CROSS_SCOPE";
  businessReason: string;
  sourceActivities: string[]; // Activity IDs that are NA causing this warning
}

export interface UndoResult {
  undoneSteps: string[];
  cascadeUndone: string[];
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface DependencyEffects {
  propagations: {
    activityId: string;
    activityTitle: string;
    stepCount: number;
    businessReason: string;
  }[];
  warnings: {
    activityId: string;
    activityTitle: string;
    scopeItemCode: string;
    warningType: "WARN_SOFT" | "WARN_CROSS_SCOPE";
    businessReason: string;
  }[];
  reversed?: UndoResult;
}
