import { describe, it, expect } from "vitest";
import { groupStepsByActivity, type ActivityStepGroup } from "@/lib/assessment/step-grouper";

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    id: `step-${Math.random().toString(36).slice(2, 8)}`,
    sequence: 1,
    actionTitle: "Test Step",
    stepType: "BusinessProcess",
    activityTitle: "Default Activity",
    activityId: "act-1",
    solutionProcessName: "Process A",
    solutionProcessFlowName: "Flow A",
    fitStatus: "PENDING",
    ...overrides,
  };
}

describe("groupStepsByActivity", () => {
  it("returns empty array for empty input", () => {
    const result = groupStepsByActivity([]);
    expect(result).toHaveLength(0);
  });

  it("groups steps by activityId", () => {
    const steps = [
      createInput({ activityId: "act-1", activityTitle: "First" }),
      createInput({ activityId: "act-1", activityTitle: "First" }),
      createInput({ activityId: "act-2", activityTitle: "Second" }),
    ];
    const result = groupStepsByActivity(steps);
    expect(result).toHaveLength(2);
    expect(result[0]!.activityId).toBe("act-1");
    expect(result[0]!.steps).toHaveLength(2);
    expect(result[1]!.activityId).toBe("act-2");
    expect(result[1]!.steps).toHaveLength(1);
  });

  it("preserves encounter order", () => {
    const steps = [
      createInput({ activityId: "act-b", activityTitle: "B" }),
      createInput({ activityId: "act-a", activityTitle: "A" }),
      createInput({ activityId: "act-b", activityTitle: "B" }),
    ];
    const result = groupStepsByActivity(steps);
    expect(result[0]!.activityId).toBe("act-b");
    expect(result[1]!.activityId).toBe("act-a");
  });

  it("tracks classifiable count per group", () => {
    const steps = [
      createInput({ activityId: "act-1", stepType: "BusinessProcess", isClassifiable: true }),
      createInput({ activityId: "act-1", stepType: "LOGON", isClassifiable: false }),
    ];
    const result = groupStepsByActivity(steps);
    expect(result[0]!.classifiableCount).toBe(1);
    expect(result[0]!.steps).toHaveLength(2);
  });

  it("includes processFlowName and solutionProcessName", () => {
    const steps = [
      createInput({
        activityId: "act-1",
        solutionProcessFlowName: "AP Flow",
        solutionProcessName: "Invoice Processing",
      }),
    ];
    const result = groupStepsByActivity(steps);
    expect(result[0]!.processFlowName).toBe("AP Flow");
    expect(result[0]!.solutionProcessName).toBe("Invoice Processing");
  });

  it("handles null activityId with string fallback", () => {
    const steps = [
      createInput({ activityId: null, activityTitle: "Manual Group" }),
      createInput({ activityId: null, activityTitle: "Manual Group" }),
    ];
    const result = groupStepsByActivity(steps);
    expect(result).toHaveLength(1);
    expect(result[0]!.activityTitle).toBe("Manual Group");
  });

  it("does not collide activities with same title but different IDs", () => {
    const steps = [
      createInput({ activityId: "act-1", activityTitle: "Post Invoice" }),
      createInput({ activityId: "act-2", activityTitle: "Post Invoice" }),
    ];
    const result = groupStepsByActivity(steps);
    expect(result).toHaveLength(2);
  });

  it("does not collide activities with same title from string-based grouping", () => {
    // If activityId is null, falls back to string key — same title same group
    const steps = [
      createInput({ activityId: null, activityTitle: "Post Invoice" }),
      createInput({ activityId: null, activityTitle: "Post Invoice" }),
    ];
    const result = groupStepsByActivity(steps);
    expect(result).toHaveLength(1);
    expect(result[0]!.steps).toHaveLength(2);
  });

  it("sets fitStatus correctly in grouped steps", () => {
    const steps = [
      createInput({ activityId: "act-1", fitStatus: "FIT" }),
      createInput({ activityId: "act-1", fitStatus: "GAP" }),
    ];
    const result = groupStepsByActivity(steps);
    expect(result[0]!.steps[0]!.fitStatus).toBe("FIT");
    expect(result[0]!.steps[1]!.fitStatus).toBe("GAP");
  });

  it("handles large number of activities efficiently", () => {
    const steps = Array.from({ length: 500 }, (_, i) =>
      createInput({
        activityId: `act-${i % 50}`,
        activityTitle: `Activity ${i % 50}`,
        sequence: i,
      }),
    );
    const result = groupStepsByActivity(steps);
    expect(result).toHaveLength(50);
    expect(result.reduce((sum, g) => sum + g.steps.length, 0)).toBe(500);
  });
});
