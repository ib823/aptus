/**
 * Phase: Dependency Engine — Unit tests for DependencyGraph.
 *
 * Tests BFS propagation, warning targets, and cycle guard.
 */

import { describe, it, expect } from "vitest";
import { DependencyGraph } from "@/lib/dependency/dependency-graph";
import type { ActivityDependency } from "@prisma/client";

// Helper to build a dependency record with activity joins
function makeDep(
  id: string,
  sourceId: string,
  targetId: string,
  rule: string,
  type = "HARD_SEQUENTIAL",
): ActivityDependency & {
  sourceActivity: { id: string; title: string };
  targetActivity: { id: string; title: string };
} {
  return {
    id,
    scopeItemCode: "TEST",
    sourceActivityId: sourceId,
    targetActivityId: targetId,
    dependencyType: type as ActivityDependency["dependencyType"],
    propagationRule: rule as ActivityDependency["propagationRule"],
    businessReason: `Test: ${sourceId} → ${targetId}`,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    sourceActivity: { id: sourceId, title: `Activity ${sourceId}` },
    targetActivity: { id: targetId, title: `Activity ${targetId}` },
  };
}

describe("DependencyGraph", () => {
  describe("constructor", () => {
    it("builds nodes from dependency records", () => {
      const deps = [
        makeDep("d1", "A", "B", "IF_SOURCE_NA_THEN_TARGET_NA"),
        makeDep("d2", "B", "C", "IF_SOURCE_NA_THEN_TARGET_NA"),
      ];
      const graph = new DependencyGraph("TEST", deps);
      expect(graph.size).toBe(3);
      expect(graph.getNode("A")).toBeDefined();
      expect(graph.getNode("B")).toBeDefined();
      expect(graph.getNode("C")).toBeDefined();
    });

    it("returns undefined for unknown nodes", () => {
      const graph = new DependencyGraph("TEST", []);
      expect(graph.getNode("MISSING")).toBeUndefined();
    });
  });

  describe("getHardPropagationTargets", () => {
    it("returns direct target for a single hard edge", () => {
      const deps = [makeDep("d1", "A", "B", "IF_SOURCE_NA_THEN_TARGET_NA")];
      const graph = new DependencyGraph("TEST", deps);

      const targets = graph.getHardPropagationTargets("A");
      expect(targets.size).toBe(1);
      expect(targets.has("B")).toBe(true);
    });

    it("follows transitive hard edges via BFS", () => {
      // A → B → C (all hard propagation)
      const deps = [
        makeDep("d1", "A", "B", "IF_SOURCE_NA_THEN_TARGET_NA"),
        makeDep("d2", "B", "C", "IF_SOURCE_NA_THEN_TARGET_NA"),
      ];
      const graph = new DependencyGraph("TEST", deps);

      const targets = graph.getHardPropagationTargets("A");
      expect(targets.size).toBe(2);
      expect(targets.has("B")).toBe(true);
      expect(targets.has("C")).toBe(true);
    });

    it("follows IF_GROUP_NA_THEN_CHILDREN_NA edges", () => {
      const deps = [makeDep("d1", "G", "C1", "IF_GROUP_NA_THEN_CHILDREN_NA")];
      const graph = new DependencyGraph("TEST", deps);

      const targets = graph.getHardPropagationTargets("G");
      expect(targets.has("C1")).toBe(true);
    });

    it("does NOT follow WARN_IF_ALL_SOURCES_NA edges", () => {
      const deps = [makeDep("d1", "A", "B", "WARN_IF_ALL_SOURCES_NA")];
      const graph = new DependencyGraph("TEST", deps);

      const targets = graph.getHardPropagationTargets("A");
      expect(targets.size).toBe(0);
    });

    it("does NOT follow WARN_ONLY edges", () => {
      const deps = [makeDep("d1", "A", "B", "WARN_ONLY")];
      const graph = new DependencyGraph("TEST", deps);

      const targets = graph.getHardPropagationTargets("A");
      expect(targets.size).toBe(0);
    });

    it("does NOT follow NO_PROPAGATION edges", () => {
      const deps = [makeDep("d1", "A", "B", "NO_PROPAGATION")];
      const graph = new DependencyGraph("TEST", deps);

      const targets = graph.getHardPropagationTargets("A");
      expect(targets.size).toBe(0);
    });

    it("excludes the source node from results", () => {
      const deps = [makeDep("d1", "A", "B", "IF_SOURCE_NA_THEN_TARGET_NA")];
      const graph = new DependencyGraph("TEST", deps);

      const targets = graph.getHardPropagationTargets("A");
      expect(targets.has("A")).toBe(false);
    });

    it("handles diamond shapes without duplicates", () => {
      // A → B, A → C, B → D, C → D
      const deps = [
        makeDep("d1", "A", "B", "IF_SOURCE_NA_THEN_TARGET_NA"),
        makeDep("d2", "A", "C", "IF_SOURCE_NA_THEN_TARGET_NA"),
        makeDep("d3", "B", "D", "IF_SOURCE_NA_THEN_TARGET_NA"),
        makeDep("d4", "C", "D", "IF_SOURCE_NA_THEN_TARGET_NA"),
      ];
      const graph = new DependencyGraph("TEST", deps);

      const targets = graph.getHardPropagationTargets("A");
      expect(targets.size).toBe(3); // B, C, D
      expect(targets.has("D")).toBe(true);
    });

    it("handles cycle guard (no infinite loop)", () => {
      // A → B → C → A (cycle)
      const deps = [
        makeDep("d1", "A", "B", "IF_SOURCE_NA_THEN_TARGET_NA"),
        makeDep("d2", "B", "C", "IF_SOURCE_NA_THEN_TARGET_NA"),
        makeDep("d3", "C", "A", "IF_SOURCE_NA_THEN_TARGET_NA"),
      ];
      const graph = new DependencyGraph("TEST", deps);

      // Should not loop infinitely; A is in visited set from the start
      const targets = graph.getHardPropagationTargets("A");
      expect(targets.size).toBe(2); // B, C (A excluded because it's the source)
    });

    it("returns empty set for unknown source", () => {
      const graph = new DependencyGraph("TEST", []);
      const targets = graph.getHardPropagationTargets("UNKNOWN");
      expect(targets.size).toBe(0);
    });
  });

  describe("getWarnTargets", () => {
    it("returns WARN_IF_ALL_SOURCES_NA edges only", () => {
      const deps = [
        makeDep("d1", "A", "B", "IF_SOURCE_NA_THEN_TARGET_NA"),
        makeDep("d2", "A", "C", "WARN_IF_ALL_SOURCES_NA"),
      ];
      const graph = new DependencyGraph("TEST", deps);

      const warns = graph.getWarnTargets("A");
      expect(warns.length).toBe(1);
      expect(warns[0]!.targetActivityId).toBe("C");
    });

    it("returns empty for unknown source", () => {
      const graph = new DependencyGraph("TEST", []);
      expect(graph.getWarnTargets("UNKNOWN")).toEqual([]);
    });
  });

  describe("getUpstream", () => {
    it("returns upstream edges for a node", () => {
      const deps = [
        makeDep("d1", "A", "C", "IF_SOURCE_NA_THEN_TARGET_NA"),
        makeDep("d2", "B", "C", "WARN_IF_ALL_SOURCES_NA"),
      ];
      const graph = new DependencyGraph("TEST", deps);

      const upstream = graph.getUpstream("C");
      expect(upstream.length).toBe(2);
      expect(upstream.map((e) => e.sourceActivityId).sort()).toEqual(["A", "B"]);
    });

    it("returns empty for unknown node", () => {
      const graph = new DependencyGraph("TEST", []);
      expect(graph.getUpstream("MISSING")).toEqual([]);
    });
  });

  describe("mixed propagation rules", () => {
    it("stops BFS at warn edges but continues through hard edges", () => {
      // A → B (hard), B → C (warn), B → D (hard)
      const deps = [
        makeDep("d1", "A", "B", "IF_SOURCE_NA_THEN_TARGET_NA"),
        makeDep("d2", "B", "C", "WARN_IF_ALL_SOURCES_NA"),
        makeDep("d3", "B", "D", "IF_SOURCE_NA_THEN_TARGET_NA"),
      ];
      const graph = new DependencyGraph("TEST", deps);

      const targets = graph.getHardPropagationTargets("A");
      expect(targets.has("B")).toBe(true);
      expect(targets.has("D")).toBe(true);
      expect(targets.has("C")).toBe(false); // Warn edge stops hard propagation
    });
  });
});
