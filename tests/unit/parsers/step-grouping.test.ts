/**
 * STATUS: Partial wire
 * REAL MODULE: src/lib/assessment/step-classifier.ts
 * PRE-EXISTING COVERAGE: tests/unit/step-classifier.test.ts
 * WIRING NOTES: isClassifiable wired to real isStepClassifiable.
 *   groupSteps kept inline — no real equivalent exists.
 */
import { describe, it, expect } from "vitest";
import { isStepClassifiable } from "@/lib/assessment/step-classifier";
import type { StepCategory } from "@/types/assessment";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Step {
  id: string;
  sequence: number;
  tag: string | null;
  activity: string | null;
}

interface StepGroup {
  label: string;
  activity: string;
  category: StepCategory;
  steps: Step[];
  classifiableCount: number;
}

// ---------------------------------------------------------------------------
// Classification — uses real isStepClassifiable from production code
// ---------------------------------------------------------------------------

const TAG_TO_CATEGORY: Record<string, StepCategory> = {
  information: "REFERENCE",
  logon: "SYSTEM_ACCESS",
  logoff: "SYSTEM_ACCESS",
  testprocedure: "TEST_INFO",
  businessprocess: "BUSINESS_PROCESS",
  configuration: "CONFIGURATION",
  reporting: "REPORTING",
  masterdata: "MASTER_DATA",
};

function classifyTag(tag: string | null): StepCategory {
  if (tag == null || tag.trim() === "") return "BUSINESS_PROCESS";
  return TAG_TO_CATEGORY[tag.toLowerCase().trim()] ?? "BUSINESS_PROCESS";
}

// Alias: wire to real production code
const isClassifiable = isStepClassifiable;

// ---------------------------------------------------------------------------
// groupSteps
// ---------------------------------------------------------------------------

/**
 * Groups steps by their `activity` field while preserving original step order.
 * Steps with a REFERENCE or SYSTEM_ACCESS tag are grouped under their
 * respective category labels. Steps with null activity default to "Process".
 */
function groupSteps(steps: Step[]): StepGroup[] {
  if (steps.length === 0) return [];

  const groupOrder: string[] = [];
  const groupMap = new Map<string, StepGroup>();

  for (const step of steps) {
    const category = classifyTag(step.tag);

    // Non-classifiable steps (REFERENCE, SYSTEM_ACCESS, TEST_INFO)
    // are grouped by their category, ignoring activity.
    let groupKey: string;
    let label: string;
    let activity: string;

    if (!isClassifiable(category)) {
      groupKey = `__category__:${category}`;
      label = categoryLabel(category);
      activity = label;
    } else {
      const activityName = step.activity ?? "Process";
      groupKey = `activity:${activityName}`;
      label = activityName;
      activity = activityName;
    }

    if (!groupMap.has(groupKey)) {
      groupOrder.push(groupKey);
      groupMap.set(groupKey, {
        label,
        activity,
        category,
        steps: [],
        classifiableCount: 0,
      });
    }

    const group = groupMap.get(groupKey)!;
    group.steps.push(step);
    if (isClassifiable(category)) {
      group.classifiableCount++;
    }
  }

  // Return groups in the order they were first encountered (preserves step sequence)
  return groupOrder.map((key) => groupMap.get(key)!);
}

function categoryLabel(category: StepCategory): string {
  switch (category) {
    case "REFERENCE":
      return "Reference";
    case "SYSTEM_ACCESS":
      return "System Access";
    case "TEST_INFO":
      return "Test Information";
    default:
      return category;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    id: overrides.id ?? `step-${Math.random().toString(36).slice(2, 8)}`,
    sequence: overrides.sequence ?? 1,
    tag: overrides.tag ?? null,
    activity: overrides.activity ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("groupSteps", () => {
  it("T-SGR-001: 56 steps with mixed tags group into Reference, System Access, and activity groups", () => {
    const steps: Step[] = [];

    // 2 information steps
    steps.push(makeStep({ sequence: 1, tag: "Information", activity: "Overview" }));
    steps.push(makeStep({ sequence: 2, tag: "Information", activity: "Overview" }));

    // 2 logon steps
    steps.push(makeStep({ sequence: 3, tag: "LogOn", activity: "System Setup" }));
    steps.push(makeStep({ sequence: 4, tag: "LogOn", activity: "System Setup" }));

    // 20 business process steps across 2 activities
    for (let i = 0; i < 10; i++) {
      steps.push(makeStep({
        sequence: 5 + i,
        tag: "BusinessProcess",
        activity: "Create Sales Order",
      }));
    }
    for (let i = 0; i < 10; i++) {
      steps.push(makeStep({
        sequence: 15 + i,
        tag: "BusinessProcess",
        activity: "Post Invoice",
      }));
    }

    // 10 configuration steps
    for (let i = 0; i < 10; i++) {
      steps.push(makeStep({
        sequence: 25 + i,
        tag: "Configuration",
        activity: "Configure Pricing",
      }));
    }

    // 5 reporting steps
    for (let i = 0; i < 5; i++) {
      steps.push(makeStep({
        sequence: 35 + i,
        tag: "Reporting",
        activity: "Run AR Report",
      }));
    }

    // 5 master data steps
    for (let i = 0; i < 5; i++) {
      steps.push(makeStep({
        sequence: 40 + i,
        tag: "MasterData",
        activity: "Create Vendor",
      }));
    }

    // 1 logoff step
    steps.push(makeStep({ sequence: 45, tag: "LogOff", activity: "System Setup" }));

    // 1 test procedure step
    steps.push(makeStep({ sequence: 46, tag: "TestProcedure", activity: "QA" }));

    // Fill remaining to reach 56
    // That's 2+2+10+10+10+5+5+1+1 = 46, need 10 more
    for (let i = 0; i < 10; i++) {
      steps.push(makeStep({
        sequence: 47 + i,
        tag: "BusinessProcess",
        activity: "Close Period",
      }));
    }

    expect(steps).toHaveLength(56);

    const groups = groupSteps(steps);

    // Should have Reference group, System Access group, and activity-based groups
    const groupLabels = groups.map((g) => g.label);
    expect(groupLabels).toContain("Reference");
    expect(groupLabels).toContain("System Access");
    expect(groupLabels).toContain("Create Sales Order");
    expect(groupLabels).toContain("Post Invoice");
    expect(groupLabels).toContain("Configure Pricing");
    expect(groupLabels).toContain("Run AR Report");
    expect(groupLabels).toContain("Create Vendor");
    expect(groupLabels).toContain("Close Period");

    // Total steps across all groups should be 56
    const totalSteps = groups.reduce((sum, g) => sum + g.steps.length, 0);
    expect(totalSteps).toBe(56);
  });

  it("T-SGR-002: all same activity produces a single group", () => {
    const steps = Array.from({ length: 10 }, (_, i) =>
      makeStep({
        sequence: i + 1,
        tag: "BusinessProcess",
        activity: "Create Sales Order",
      }),
    );

    const groups = groupSteps(steps);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("Create Sales Order");
    expect(groups[0]!.steps).toHaveLength(10);
  });

  it("T-SGR-003: null activity groups as 'Process'", () => {
    const steps = [
      makeStep({ sequence: 1, tag: "BusinessProcess", activity: null }),
      makeStep({ sequence: 2, tag: "BusinessProcess", activity: null }),
      makeStep({ sequence: 3, tag: "Configuration", activity: null }),
    ];

    const groups = groupSteps(steps);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.activity).toBe("Process");
    expect(groups[0]!.steps).toHaveLength(3);
  });

  it("T-SGR-004: classifiable count per group is accurate", () => {
    const steps = [
      makeStep({ sequence: 1, tag: "Information", activity: "Overview" }),
      makeStep({ sequence: 2, tag: "BusinessProcess", activity: "Create PO" }),
      makeStep({ sequence: 3, tag: "BusinessProcess", activity: "Create PO" }),
      makeStep({ sequence: 4, tag: "Configuration", activity: "Config Pricing" }),
      makeStep({ sequence: 5, tag: "LogOn", activity: "System" }),
    ];

    const groups = groupSteps(steps);

    // Reference group (Information) — not classifiable → count = 0
    const refGroup = groups.find((g) => g.label === "Reference");
    expect(refGroup).toBeDefined();
    expect(refGroup!.classifiableCount).toBe(0);

    // System Access group (LogOn) — not classifiable → count = 0
    const sysGroup = groups.find((g) => g.label === "System Access");
    expect(sysGroup).toBeDefined();
    expect(sysGroup!.classifiableCount).toBe(0);

    // "Create PO" group — both BUSINESS_PROCESS → count = 2
    const poGroup = groups.find((g) => g.label === "Create PO");
    expect(poGroup).toBeDefined();
    expect(poGroup!.classifiableCount).toBe(2);

    // "Config Pricing" group — CONFIGURATION → count = 1
    const configGroup = groups.find((g) => g.label === "Config Pricing");
    expect(configGroup).toBeDefined();
    expect(configGroup!.classifiableCount).toBe(1);
  });

  it("T-SGR-005: non-classifiable steps are excluded from progress counting", () => {
    const steps = [
      makeStep({ sequence: 1, tag: "Information", activity: "Overview" }),
      makeStep({ sequence: 2, tag: "LogOn", activity: "System" }),
      makeStep({ sequence: 3, tag: "LogOff", activity: "System" }),
      makeStep({ sequence: 4, tag: "TestProcedure", activity: "QA" }),
      makeStep({ sequence: 5, tag: "BusinessProcess", activity: "Create PO" }),
    ];

    const groups = groupSteps(steps);

    // Sum all classifiable counts
    const totalClassifiable = groups.reduce(
      (sum, g) => sum + g.classifiableCount,
      0,
    );

    // Only the BusinessProcess step should be classifiable
    expect(totalClassifiable).toBe(1);

    // Total steps should still be 5
    const totalSteps = groups.reduce((sum, g) => sum + g.steps.length, 0);
    expect(totalSteps).toBe(5);
  });

  it("T-SGR-006: group ordering matches step sequence, not alphabetical", () => {
    const steps = [
      makeStep({ sequence: 1, tag: "BusinessProcess", activity: "Zebra Process" }),
      makeStep({ sequence: 2, tag: "BusinessProcess", activity: "Alpha Process" }),
      makeStep({ sequence: 3, tag: "BusinessProcess", activity: "Middle Process" }),
    ];

    const groups = groupSteps(steps);
    const labels = groups.map((g) => g.label);

    // Should be in encounter order, not alphabetical
    expect(labels).toEqual(["Zebra Process", "Alpha Process", "Middle Process"]);
    expect(labels).not.toEqual([...labels].sort());
  });

  it("T-SGR-007: single step produces a single group", () => {
    const steps = [
      makeStep({ sequence: 1, tag: "BusinessProcess", activity: "Create SO" }),
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
