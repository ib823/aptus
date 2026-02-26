import { describe, it, expect } from "vitest";
import {
  computeHierarchicalLayout,
  type HierarchicalLayoutStep,
} from "@/lib/assessment/flow-layout";

function createStep(overrides: Partial<HierarchicalLayoutStep> = {}): HierarchicalLayoutStep {
  return {
    id: `step-${Math.random().toString(36).slice(2, 8)}`,
    sequence: 1,
    actionTitle: "Test Step",
    fitStatus: "PENDING",
    scopeItemId: "J60",
    processStepId: "ps-1",
    activityId: "act-1",
    activityTitle: "Activity One",
    ...overrides,
  };
}

describe("computeHierarchicalLayout", () => {
  it("returns empty result for empty input", () => {
    const result = computeHierarchicalLayout([]);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.activitySections).toHaveLength(0);
  });

  it("groups steps by activityId into sections", () => {
    const steps = [
      createStep({ sequence: 1, activityId: "act-1", activityTitle: "First" }),
      createStep({ sequence: 2, activityId: "act-1", activityTitle: "First" }),
      createStep({ sequence: 3, activityId: "act-2", activityTitle: "Second" }),
    ];
    const result = computeHierarchicalLayout(steps);
    expect(result.activitySections).toHaveLength(2);
    expect(result.activitySections[0]!.activityTitle).toBe("First");
    expect(result.activitySections[0]!.nodeIds).toHaveLength(2);
    expect(result.activitySections[1]!.activityTitle).toBe("Second");
    expect(result.activitySections[1]!.nodeIds).toHaveLength(1);
  });

  it("creates edges within activity sections", () => {
    const steps = [
      createStep({ id: "a", sequence: 1, activityId: "act-1" }),
      createStep({ id: "b", sequence: 2, activityId: "act-1" }),
    ];
    const result = computeHierarchicalLayout(steps);
    expect(result.edges.length).toBeGreaterThanOrEqual(1);
    const intraEdge = result.edges.find(
      (e) => e.sourceId === "node-a" && e.targetId === "node-b",
    );
    expect(intraEdge).toBeDefined();
  });

  it("creates cross-section edges between last/first nodes", () => {
    const steps = [
      createStep({ id: "a", sequence: 1, activityId: "act-1" }),
      createStep({ id: "b", sequence: 2, activityId: "act-2" }),
    ];
    const result = computeHierarchicalLayout(steps);
    const crossEdge = result.edges.find(
      (e) => e.sourceId === "node-a" && e.targetId === "node-b",
    );
    expect(crossEdge).toBeDefined();
  });

  it("assigns unique positions to all nodes", () => {
    const steps = Array.from({ length: 10 }, (_, i) =>
      createStep({ sequence: i, activityId: i < 5 ? "act-1" : "act-2" }),
    );
    const result = computeHierarchicalLayout(steps);
    const positions = result.nodes.map((n) => `${n.position.x},${n.position.y}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(positions.length);
  });

  it("handles null activityId with fallback group", () => {
    const steps = [
      createStep({ sequence: 1, activityId: null, activityTitle: null }),
      createStep({ sequence: 2, activityId: null, activityTitle: null }),
    ];
    const result = computeHierarchicalLayout(steps);
    expect(result.activitySections).toHaveLength(1);
    expect(result.activitySections[0]!.activityTitle).toBe("Process Steps");
  });

  it("generates correct viewBox dimensions", () => {
    const steps = [
      createStep({ sequence: 1, activityId: "act-1" }),
    ];
    const result = computeHierarchicalLayout(steps);
    expect(result.viewBox.width).toBeGreaterThan(0);
    expect(result.viewBox.height).toBeGreaterThan(0);
  });
});
