/**
 * STATUS: Wired to real production code
 * REAL MODULE: src/lib/assessment/step-grouper.ts
 * Uses: groupSteps (legacy alias), groupStepsByActivity (primary) from real module
 */
import { describe, it, expect } from "vitest";
import { groupSteps, groupStepsByActivity } from "@/lib/assessment/step-grouper";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestStep {
  id: string;
  sequence: number;
  actionTitle: string;
  stepType: string;
  activityTitle: string | null;
  tag?: string | null;
  activity?: string | null;
}

function makeStep(overrides: Partial<TestStep> = {}): TestStep {
  return {
    id: overrides.id ?? `step-${Math.random().toString(36).slice(2, 8)}`,
    sequence: overrides.sequence ?? 1,
    actionTitle: overrides.actionTitle ?? "Test Step",
    stepType: overrides.stepType ?? "PROCESS_STEP",
    activityTitle: overrides.activityTitle ?? overrides.activity ?? null,
    tag: overrides.tag ?? null,
    activity: overrides.activity ?? overrides.activityTitle ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("groupSteps", () => {
  it("T-SGR-001: 56 steps with mixed tags group into Reference, System Access, and activity groups", () => {
    const steps: TestStep[] = [];

    // 2 information steps
    steps.push(makeStep({ sequence: 1, stepType: "INFORMATION", activityTitle: "Overview" }));
    steps.push(makeStep({ sequence: 2, stepType: "INFORMATION", activityTitle: "Overview" }));

    // 2 logon steps
    steps.push(makeStep({ sequence: 3, stepType: "LOGON", activityTitle: "System Setup" }));
    steps.push(makeStep({ sequence: 4, stepType: "LOGON", activityTitle: "System Setup" }));

    // 20 business process steps across 2 activities
    for (let i = 0; i < 10; i++) {
      steps.push(makeStep({
        sequence: 5 + i,
        stepType: "DATA_ENTRY",
        activityTitle: "Create Sales Order",
      }));
    }
    for (let i = 0; i < 10; i++) {
      steps.push(makeStep({
        sequence: 15 + i,
        stepType: "ACTION",
        activityTitle: "Post Invoice",
      }));
    }

    // 10 configuration steps (using lowercase tag for variety)
    for (let i = 0; i < 10; i++) {
      steps.push(makeStep({
        sequence: 25 + i,
        stepType: "PROCESS_STEP",
        tag: "configuration",
        activityTitle: "Configure Pricing",
      }));
    }

    // 5 reporting steps
    for (let i = 0; i < 5; i++) {
      steps.push(makeStep({
        sequence: 35 + i,
        stepType: "PROCESS_STEP",
        tag: "reporting",
        activityTitle: "Run AR Report",
      }));
    }

    // 5 master data steps
    for (let i = 0; i < 5; i++) {
      steps.push(makeStep({
        sequence: 40 + i,
        stepType: "PROCESS_STEP",
        tag: "masterdata",
        activityTitle: "Create Vendor",
      }));
    }

    // 1 logoff step
    steps.push(makeStep({ sequence: 45, stepType: "LOGOFF", activityTitle: "System Setup" }));

    // 1 test procedure step
    steps.push(makeStep({ sequence: 46, stepType: "PROCESS_STEP", tag: "testprocedure", activityTitle: "QA" }));

    // Fill remaining to reach 56 (2+2+10+10+10+5+5+1+1 = 46, need 10 more)
    for (let i = 0; i < 10; i++) {
      steps.push(makeStep({
        sequence: 47 + i,
        stepType: "DATA_ENTRY",
        activityTitle: "Close Period",
      }));
    }

    expect(steps).toHaveLength(56);

    const groups = groupSteps(steps);

    const groupLabels = groups.map((g) => g.label);
    expect(groupLabels).toContain("Reference");
    expect(groupLabels).toContain("System Access");
    expect(groupLabels).toContain("Create Sales Order");
    expect(groupLabels).toContain("Post Invoice");
    expect(groupLabels).toContain("Configure Pricing");
    expect(groupLabels).toContain("Run AR Report");
    expect(groupLabels).toContain("Create Vendor");
    expect(groupLabels).toContain("Close Period");

    const totalSteps = groups.reduce((sum, g) => sum + g.steps.length, 0);
    expect(totalSteps).toBe(56);
  });

  it("T-SGR-002: all same activity produces a single group", () => {
    const steps = Array.from({ length: 10 }, (_, i) =>
      makeStep({
        sequence: i + 1,
        stepType: "DATA_ENTRY",
        activityTitle: "Create Sales Order",
      }),
    );

    const groups = groupSteps(steps);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Create Sales Order");
    expect(groups[0]!.steps).toHaveLength(10);
  });

  it("T-SGR-003: null activity groups as 'Process'", () => {
    const steps = [
      makeStep({ sequence: 1, stepType: "DATA_ENTRY", activityTitle: null }),
      makeStep({ sequence: 2, stepType: "ACTION", activityTitle: null }),
      makeStep({ sequence: 3, stepType: "PROCESS_STEP", activityTitle: null }),
    ];

    const groups = groupSteps(steps);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Process");
    expect(groups[0]!.steps).toHaveLength(3);
  });

  it("T-SGR-004: classifiable count per group is accurate", () => {
    const steps = [
      makeStep({ sequence: 1, stepType: "INFORMATION", activityTitle: "Overview" }),
      makeStep({ sequence: 2, stepType: "DATA_ENTRY", activityTitle: "Create PO" }),
      makeStep({ sequence: 3, stepType: "ACTION", activityTitle: "Create PO" }),
      makeStep({ sequence: 4, stepType: "PROCESS_STEP", tag: "configuration", activityTitle: "Config Pricing" }),
      makeStep({ sequence: 5, stepType: "LOGON", activityTitle: "System" }),
    ];

    const groups = groupSteps(steps);

    const refGroup = groups.find((g) => g.label === "Reference");
    expect(refGroup).toBeDefined();
    expect(refGroup!.classifiableCount).toBe(0);

    const sysGroup = groups.find((g) => g.label === "System Access");
    expect(sysGroup).toBeDefined();
    expect(sysGroup!.classifiableCount).toBe(0);

    const poGroup = groups.find((g) => g.label === "Create PO");
    expect(poGroup).toBeDefined();
    expect(poGroup!.classifiableCount).toBe(2);

    const configGroup = groups.find((g) => g.label === "Config Pricing");
    expect(configGroup).toBeDefined();
    expect(configGroup!.classifiableCount).toBe(1);
  });

  it("T-SGR-005: non-classifiable steps are excluded from progress counting", () => {
    const steps = [
      makeStep({ sequence: 1, stepType: "INFORMATION", activityTitle: "Overview" }),
      makeStep({ sequence: 2, stepType: "LOGON", activityTitle: "System" }),
      makeStep({ sequence: 3, stepType: "LOGOFF", activityTitle: "System" }),
      makeStep({ sequence: 4, stepType: "PROCESS_STEP", tag: "testprocedure", activityTitle: "QA" }),
      makeStep({ sequence: 5, stepType: "DATA_ENTRY", activityTitle: "Create PO" }),
    ];

    const groups = groupSteps(steps);

    const totalClassifiable = groups.reduce(
      (sum, g) => sum + g.classifiableCount,
      0,
    );

    expect(totalClassifiable).toBe(1);

    const totalSteps = groups.reduce((sum, g) => sum + g.steps.length, 0);
    expect(totalSteps).toBe(5);
  });

  it("T-SGR-006: group ordering matches step sequence, not alphabetical", () => {
    const steps = [
      makeStep({ sequence: 1, stepType: "DATA_ENTRY", activityTitle: "Zebra Process" }),
      makeStep({ sequence: 2, stepType: "DATA_ENTRY", activityTitle: "Alpha Process" }),
      makeStep({ sequence: 3, stepType: "DATA_ENTRY", activityTitle: "Middle Process" }),
    ];

    const groups = groupSteps(steps);
    const labels = groups.map((g) => g.label);

    expect(labels).toEqual(["Zebra Process", "Alpha Process", "Middle Process"]);
    expect(labels).not.toEqual([...labels].sort());
  });

  it("T-SGR-007: single step produces a single group", () => {
    const steps = [
      makeStep({ sequence: 1, stepType: "DATA_ENTRY", activityTitle: "Create SO" }),
    ];

    const groups = groupSteps(steps);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.steps).toHaveLength(1);
    expect(groups[0]!.label).toBe("Create SO");
  });

  it("T-SGR-008: zero steps produces empty array with no crash", () => {
    const groups = groupSteps([]);
    expect(groups).toEqual([]);
    expect(groups).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// groupStepsByActivity (primary entity-based grouper)
// ---------------------------------------------------------------------------

describe("groupStepsByActivity", () => {
  it("T-SGR-009: groups by activityId FK, not activity title string", () => {
    const steps = [
      { id: "s1", sequence: 1, actionTitle: "Step A", stepType: "DATA_ENTRY", activityTitle: "Create PO", activityId: "act-1" },
      { id: "s2", sequence: 2, actionTitle: "Step B", stepType: "DATA_ENTRY", activityTitle: "Create PO", activityId: "act-1" },
      { id: "s3", sequence: 3, actionTitle: "Step C", stepType: "DATA_ENTRY", activityTitle: "Create PO", activityId: "act-2" },
    ];

    const groups = groupStepsByActivity(steps);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.activityId).toBe("act-1");
    expect(groups[0]!.steps).toHaveLength(2);
    expect(groups[1]!.activityId).toBe("act-2");
    expect(groups[1]!.steps).toHaveLength(1);
  });

  it("T-SGR-010: same title different IDs produce separate groups (no collision)", () => {
    const steps = [
      { id: "s1", sequence: 1, actionTitle: "Step A", stepType: "DATA_ENTRY", activityTitle: "Post Invoice", activityId: "act-A" },
      { id: "s2", sequence: 2, actionTitle: "Step B", stepType: "DATA_ENTRY", activityTitle: "Post Invoice", activityId: "act-B" },
    ];

    const groups = groupStepsByActivity(steps);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.activityId).not.toBe(groups[1]!.activityId);
  });

  it("T-SGR-011: falls back to string key when activityId is null", () => {
    const steps = [
      { id: "s1", sequence: 1, actionTitle: "Step A", stepType: "DATA_ENTRY", activityTitle: "Create SO", activityId: null },
      { id: "s2", sequence: 2, actionTitle: "Step B", stepType: "DATA_ENTRY", activityTitle: "Create SO", activityId: null },
    ];

    const groups = groupStepsByActivity(steps);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.activityTitle).toBe("Create SO");
    expect(groups[0]!.steps).toHaveLength(2);
  });

  it("T-SGR-012: empty input returns empty array", () => {
    expect(groupStepsByActivity([])).toEqual([]);
  });

  it("T-SGR-013: classifiable count is accurate per activity group", () => {
    const steps = [
      { id: "s1", sequence: 1, actionTitle: "Step A", stepType: "DATA_ENTRY", activityTitle: "Create PO", activityId: "act-1" },
      { id: "s2", sequence: 2, actionTitle: "Step B", stepType: "INFORMATION", activityTitle: "Create PO", activityId: "act-1" },
      { id: "s3", sequence: 3, actionTitle: "Step C", stepType: "DATA_ENTRY", activityTitle: "Post Invoice", activityId: "act-2" },
    ];

    const groups = groupStepsByActivity(steps);
    const act1 = groups.find((g) => g.activityId === "act-1");
    expect(act1!.classifiableCount).toBe(1);
    const act2 = groups.find((g) => g.activityId === "act-2");
    expect(act2!.classifiableCount).toBe(1);
  });

  it("T-SGR-014: preserves process flow and solution process names", () => {
    const steps = [
      {
        id: "s1", sequence: 1, actionTitle: "Step A", stepType: "DATA_ENTRY",
        activityTitle: "Create PO", activityId: "act-1",
        solutionProcessFlowName: "Procurement Flow",
        solutionProcessName: "Procurement",
      },
    ];

    const groups = groupStepsByActivity(steps);
    expect(groups[0]!.processFlowName).toBe("Procurement Flow");
    expect(groups[0]!.solutionProcessName).toBe("Procurement");
  });
});
