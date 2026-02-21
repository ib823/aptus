import { describe, it, expect } from "vitest";
import {
  detectCircularDependency,
  topologicalSort,
  getCriticalPath,
} from "@/lib/assessment/dependency-graph";

describe("detectCircularDependency", () => {
  it("returns false for a simple chain with no cycle", () => {
    const objects = [
      { id: "A", dependsOn: [] },
      { id: "B", dependsOn: ["A"] },
      { id: "C", dependsOn: ["B"] },
    ];
    const result = detectCircularDependency(objects, { from: "C", to: "A" });
    // C -> A -> (no deps), and C already depends on B -> A, adding C->A doesn't create cycle
    // Actually C now depends on both B and A; B depends on A. No cycle.
    expect(result.circular).toBe(false);
  });

  it("detects self-reference", () => {
    const objects = [{ id: "A", dependsOn: [] }];
    const result = detectCircularDependency(objects, { from: "A", to: "A" });
    expect(result.circular).toBe(true);
    expect(result.cycle).toContain("A");
  });

  it("detects direct cycle between two nodes", () => {
    const objects = [
      { id: "A", dependsOn: ["B"] },
      { id: "B", dependsOn: [] },
    ];
    // Adding B -> A creates B -> A -> B cycle
    const result = detectCircularDependency(objects, { from: "B", to: "A" });
    expect(result.circular).toBe(true);
  });

  it("detects indirect cycle through multiple nodes", () => {
    const objects = [
      { id: "A", dependsOn: [] },
      { id: "B", dependsOn: ["A"] },
      { id: "C", dependsOn: ["B"] },
    ];
    // Adding A -> C creates A -> C -> B -> A cycle
    const result = detectCircularDependency(objects, { from: "A", to: "C" });
    expect(result.circular).toBe(true);
    expect(result.cycle.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty cycle array when no cycle exists", () => {
    const objects = [
      { id: "A", dependsOn: [] },
      { id: "B", dependsOn: [] },
    ];
    const result = detectCircularDependency(objects, { from: "A", to: "B" });
    expect(result.circular).toBe(false);
    expect(result.cycle).toEqual([]);
  });

  it("handles empty objects array", () => {
    const result = detectCircularDependency([], { from: "A", to: "B" });
    expect(result.circular).toBe(false);
    expect(result.cycle).toEqual([]);
  });

  it("handles dependency to non-existent node", () => {
    const objects = [{ id: "A", dependsOn: [] }];
    const result = detectCircularDependency(objects, { from: "A", to: "Z" });
    expect(result.circular).toBe(false);
  });
});

describe("topologicalSort", () => {
  it("returns correct order for a simple chain", () => {
    const objects = [
      { id: "C", dependsOn: ["B"] },
      { id: "B", dependsOn: ["A"] },
      { id: "A", dependsOn: [] },
    ];
    const sorted = topologicalSort(objects);
    expect(sorted.indexOf("A")).toBeLessThan(sorted.indexOf("B"));
    expect(sorted.indexOf("B")).toBeLessThan(sorted.indexOf("C"));
  });

  it("returns all IDs", () => {
    const objects = [
      { id: "A", dependsOn: [] },
      { id: "B", dependsOn: ["A"] },
      { id: "C", dependsOn: [] },
    ];
    const sorted = topologicalSort(objects);
    expect(sorted.length).toBe(3);
    expect(sorted).toContain("A");
    expect(sorted).toContain("B");
    expect(sorted).toContain("C");
  });

  it("handles empty input", () => {
    expect(topologicalSort([])).toEqual([]);
  });

  it("handles independent nodes", () => {
    const objects = [
      { id: "X", dependsOn: [] },
      { id: "Y", dependsOn: [] },
      { id: "Z", dependsOn: [] },
    ];
    const sorted = topologicalSort(objects);
    expect(sorted.length).toBe(3);
  });

  it("respects diamond dependency shape", () => {
    // A -> B, A -> C, B -> D, C -> D
    const objects = [
      { id: "D", dependsOn: ["B", "C"] },
      { id: "B", dependsOn: ["A"] },
      { id: "C", dependsOn: ["A"] },
      { id: "A", dependsOn: [] },
    ];
    const sorted = topologicalSort(objects);
    expect(sorted.indexOf("A")).toBeLessThan(sorted.indexOf("B"));
    expect(sorted.indexOf("A")).toBeLessThan(sorted.indexOf("C"));
    expect(sorted.indexOf("B")).toBeLessThan(sorted.indexOf("D"));
    expect(sorted.indexOf("C")).toBeLessThan(sorted.indexOf("D"));
  });

  it("ignores dependencies on IDs not in the graph", () => {
    const objects = [
      { id: "A", dependsOn: ["MISSING"] },
      { id: "B", dependsOn: ["A"] },
    ];
    const sorted = topologicalSort(objects);
    expect(sorted.indexOf("A")).toBeLessThan(sorted.indexOf("B"));
  });
});

describe("getCriticalPath", () => {
  it("returns empty for empty input", () => {
    expect(getCriticalPath([])).toEqual({ path: [], totalDays: 0 });
  });

  it("returns single node for one item", () => {
    const result = getCriticalPath([{ id: "A", dependsOn: [], estimatedDays: 5 }]);
    expect(result.path).toEqual(["A"]);
    expect(result.totalDays).toBe(5);
  });

  it("returns correct critical path for a chain", () => {
    const objects = [
      { id: "A", dependsOn: [], estimatedDays: 3 },
      { id: "B", dependsOn: ["A"], estimatedDays: 5 },
      { id: "C", dependsOn: ["B"], estimatedDays: 2 },
    ];
    const result = getCriticalPath(objects);
    expect(result.path).toEqual(["A", "B", "C"]);
    expect(result.totalDays).toBe(10);
  });

  it("picks the longer branch in a fork", () => {
    const objects = [
      { id: "A", dependsOn: [], estimatedDays: 1 },
      { id: "B", dependsOn: ["A"], estimatedDays: 10 },
      { id: "C", dependsOn: ["A"], estimatedDays: 2 },
    ];
    const result = getCriticalPath(objects);
    expect(result.path).toEqual(["A", "B"]);
    expect(result.totalDays).toBe(11);
  });

  it("handles independent nodes and picks the one with highest days", () => {
    const objects = [
      { id: "X", dependsOn: [], estimatedDays: 1 },
      { id: "Y", dependsOn: [], estimatedDays: 20 },
    ];
    const result = getCriticalPath(objects);
    expect(result.totalDays).toBe(20);
    expect(result.path).toContain("Y");
  });
});
