/**
 * Phase: Dependency Engine — In-memory adjacency list.
 *
 * Builds an immutable directed graph from ActivityDependency records.
 * Provides BFS-based propagation target resolution with cycle guards.
 */

import type { DependencyNode, DependencyEdge } from "./types";
import type { ActivityDependency } from "@prisma/client";

type DependencyWithActivities = ActivityDependency & {
  sourceActivity: { id: string; title: string };
  targetActivity: { id: string; title: string };
};

export class DependencyGraph {
  private readonly nodes = new Map<string, DependencyNode>();
  readonly scopeItemCode: string;

  constructor(
    scopeItemCode: string,
    dependencies: DependencyWithActivities[],
  ) {
    this.scopeItemCode = scopeItemCode;

    for (const dep of dependencies) {
      // Ensure source node
      if (!this.nodes.has(dep.sourceActivityId)) {
        this.nodes.set(dep.sourceActivityId, {
          activityId: dep.sourceActivityId,
          activityTitle: dep.sourceActivity.title,
          scopeItemCode,
          downstream: [],
          upstream: [],
        });
      }

      // Ensure target node
      if (!this.nodes.has(dep.targetActivityId)) {
        this.nodes.set(dep.targetActivityId, {
          activityId: dep.targetActivityId,
          activityTitle: dep.targetActivity.title,
          scopeItemCode,
          downstream: [],
          upstream: [],
        });
      }

      const edge: DependencyEdge = {
        dependencyId: dep.id,
        sourceActivityId: dep.sourceActivityId,
        targetActivityId: dep.targetActivityId,
        type: dep.dependencyType,
        propagationRule: dep.propagationRule,
        businessReason: dep.businessReason,
      };

      this.nodes.get(dep.sourceActivityId)!.downstream.push(edge);
      this.nodes.get(dep.targetActivityId)!.upstream.push(edge);
    }
  }

  /**
   * BFS from sourceActivityId following only edges whose propagation rule
   * is IF_SOURCE_NA_THEN_TARGET_NA or IF_GROUP_NA_THEN_CHILDREN_NA.
   * Returns the set of reachable activity IDs (excluding the source itself).
   */
  getHardPropagationTargets(sourceActivityId: string): Set<string> {
    const targets = new Set<string>();
    const visited = new Set<string>();
    const queue: string[] = [sourceActivityId];
    visited.add(sourceActivityId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = this.nodes.get(current);
      if (!node) continue;

      for (const edge of node.downstream) {
        if (
          edge.propagationRule !== "IF_SOURCE_NA_THEN_TARGET_NA" &&
          edge.propagationRule !== "IF_GROUP_NA_THEN_CHILDREN_NA"
        ) {
          continue;
        }

        if (visited.has(edge.targetActivityId)) continue;
        visited.add(edge.targetActivityId);
        targets.add(edge.targetActivityId);
        queue.push(edge.targetActivityId);
      }
    }

    return targets;
  }

  /**
   * Get all downstream edges from an activity where the propagation rule
   * is WARN_IF_ALL_SOURCES_NA.
   */
  getWarnTargets(sourceActivityId: string): DependencyEdge[] {
    const node = this.nodes.get(sourceActivityId);
    if (!node) return [];
    return node.downstream.filter(
      (e) => e.propagationRule === "WARN_IF_ALL_SOURCES_NA",
    );
  }

  /** Get the node for an activity ID, or undefined if not in the graph. */
  getNode(activityId: string): DependencyNode | undefined {
    return this.nodes.get(activityId);
  }

  /** Get all upstream (source) edges for a given target activity. */
  getUpstream(activityId: string): DependencyEdge[] {
    return this.nodes.get(activityId)?.upstream ?? [];
  }

  /** Number of nodes in the graph. */
  get size(): number {
    return this.nodes.size;
  }
}
