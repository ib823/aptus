import { describe, it, expect } from "vitest";
import * as StepFactory from "../factories/step.factory";

describe("Activity-scoped steps", () => {
  it("createWithHierarchy produces step with activityId", () => {
    const step = StepFactory.createWithHierarchy();
    expect(step.activityId).toBe("test-activity-1");
    expect(step.solutionProcessName).toBe("Invoice Receipt");
    expect(step.solutionProcessFlowName).toBe("Accounts Payable Flow");
    expect(step.activityTitle).toBe("Post Vendor Invoice");
  });

  it("createWithHierarchy allows activityId override", () => {
    const step = StepFactory.createWithHierarchy({ activityId: "custom-act" });
    expect(step.activityId).toBe("custom-act");
  });

  it("regular create produces step with null activityId", () => {
    const step = StepFactory.create();
    expect(step.activityId).toBeNull();
  });

  it("steps can be filtered by activityId", () => {
    const steps = [
      StepFactory.createWithHierarchy({ activityId: "act-1", sequence: 1 }),
      StepFactory.createWithHierarchy({ activityId: "act-1", sequence: 2 }),
      StepFactory.createWithHierarchy({ activityId: "act-2", sequence: 3 }),
    ];
    const filtered = steps.filter((s) => s.activityId === "act-1");
    expect(filtered).toHaveLength(2);
  });

  it("steps maintain sequence ordering within activity", () => {
    const steps = [
      StepFactory.createWithHierarchy({ activityId: "act-1", sequence: 5 }),
      StepFactory.createWithHierarchy({ activityId: "act-1", sequence: 1 }),
      StepFactory.createWithHierarchy({ activityId: "act-1", sequence: 3 }),
    ];
    const sorted = steps.sort((a, b) => a.sequence - b.sequence);
    expect(sorted.map((s) => s.sequence)).toEqual([1, 3, 5]);
  });

  it("handles empty activity (no steps)", () => {
    const steps = [
      StepFactory.createWithHierarchy({ activityId: "act-1" }),
    ];
    const filtered = steps.filter((s) => s.activityId === "act-nonexistent");
    expect(filtered).toHaveLength(0);
  });

  it("createWithRealSAPContent has activityId by default", () => {
    const step = StepFactory.createWithRealSAPContent();
    expect(step.activityId).toBe("real-sap-activity-1");
  });

  it("createWithRealSAPContent can be given activityId", () => {
    const step = StepFactory.createWithRealSAPContent({ activityId: "real-act" });
    expect(step.activityId).toBe("real-act");
  });
});
