import { describe, it, expect } from "vitest";
import { getDefaultWidgets, getHeatmapColor } from "@/lib/dashboard/widgets";
import { computeAttentionItems, priorityComparator } from "@/lib/dashboard/attention-engine";
import { calculateKpiMetrics } from "@/lib/dashboard/kpi-calculator";
import type { UserRole } from "@/types/assessment";
import type { AttentionItem } from "@/types/dashboard";

const ALL_ROLES: UserRole[] = [
  "platform_admin",
  "partner_lead",
  "consultant",
  "project_manager",
  "solution_architect",
  "process_owner",
  "it_lead",
  "data_migration_lead",
  "executive_sponsor",
  "viewer",
  "client_admin",
];

describe("getDefaultWidgets (Phase 23)", () => {
  it.each(ALL_ROLES)("returns widgets for role: %s", (role) => {
    const widgets = getDefaultWidgets(role);
    expect(widgets.length).toBeGreaterThan(0);
    for (const [index, widget] of widgets.entries()) {
      expect(widget.position).toBe(index);
      expect(widget.isVisible).toBe(true);
      expect(typeof widget.widgetType).toBe("string");
    }
  });

  it("returns more widgets for admin roles than viewer", () => {
    const adminWidgets = getDefaultWidgets("platform_admin");
    const viewerWidgets = getDefaultWidgets("viewer");
    expect(adminWidgets.length).toBeGreaterThan(viewerWidgets.length);
  });

  it("includes attention widget for all admin/lead roles", () => {
    const roles: UserRole[] = ["platform_admin", "partner_lead", "consultant", "project_manager"];
    for (const role of roles) {
      const widgets = getDefaultWidgets(role);
      expect(widgets.some((w) => w.widgetType === "attention")).toBe(true);
    }
  });

  it("includes kpi widget for executive sponsor", () => {
    const widgets = getDefaultWidgets("executive_sponsor");
    expect(widgets.some((w) => w.widgetType === "kpi")).toBe(true);
  });
});

describe("getHeatmapColor (Phase 23)", () => {
  it("returns gray for 0%", () => {
    expect(getHeatmapColor(0)).toBe("bg-gray-100");
  });

  it("returns red for low completion", () => {
    expect(getHeatmapColor(10)).toBe("bg-red-200");
  });

  it("returns orange for 25-49%", () => {
    expect(getHeatmapColor(30)).toBe("bg-orange-200");
  });

  it("returns yellow for 50-74%", () => {
    expect(getHeatmapColor(60)).toBe("bg-yellow-200");
  });

  it("returns light green for 75-99%", () => {
    expect(getHeatmapColor(80)).toBe("bg-green-200");
  });

  it("returns dark green for 100%", () => {
    expect(getHeatmapColor(100)).toBe("bg-green-400");
  });
});

describe("priorityComparator (Phase 23)", () => {
  it("sorts critical before warning", () => {
    const a: AttentionItem = {
      id: "1",
      severity: "critical",
      title: "A",
      description: "",
      entityType: "deadline",
      entityId: "d1",
      createdAt: "2024-01-01T00:00:00Z",
    };
    const b: AttentionItem = {
      id: "2",
      severity: "warning",
      title: "B",
      description: "",
      entityType: "conflict",
      entityId: "c1",
      createdAt: "2024-01-02T00:00:00Z",
    };
    expect(priorityComparator(a, b)).toBeLessThan(0);
  });

  it("sorts same severity by recency (newer first)", () => {
    const a: AttentionItem = {
      id: "1",
      severity: "warning",
      title: "A",
      description: "",
      entityType: "gap",
      entityId: "g1",
      createdAt: "2024-01-01T00:00:00Z",
    };
    const b: AttentionItem = {
      id: "2",
      severity: "warning",
      title: "B",
      description: "",
      entityType: "gap",
      entityId: "g2",
      createdAt: "2024-01-05T00:00:00Z",
    };
    expect(priorityComparator(a, b)).toBeGreaterThan(0);
  });
});

describe("computeAttentionItems (Phase 23)", () => {
  it("returns empty array for no inputs", () => {
    const items = computeAttentionItems([], [], [], [], []);
    expect(items).toHaveLength(0);
  });

  it("creates critical items for overdue deadlines", () => {
    const items = computeAttentionItems(
      [],
      [],
      [{ id: "d1", title: "Milestone 1", dueDate: "2024-01-01T00:00:00Z", assessmentId: "a1" }],
      [],
      [],
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.severity).toBe("critical");
  });

  it("creates warning items for conflicts", () => {
    const items = computeAttentionItems(
      [],
      [],
      [],
      [{ id: "c1", entityType: "step", entityId: "s1", assessmentId: "a1", createdAt: "2024-01-01T00:00:00Z" }],
      [],
    );
    expect(items.some((i) => i.severity === "warning")).toBe(true);
  });

  it("sorts items by severity then recency", () => {
    const items = computeAttentionItems(
      [],
      [{ id: "g1", scopeItemId: "si1", gapDescription: "Old gap that needs fixing", createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() }],
      [{ id: "d1", title: "Deadline", dueDate: "2024-01-01T00:00:00Z", assessmentId: "a1" }],
      [],
      [],
    );
    // Critical (deadline) should come before warning (gap)
    expect(items[0]?.severity).toBe("critical");
  });

  it("includes stale assessments as info/warning", () => {
    const items = computeAttentionItems(
      [],
      [],
      [],
      [],
      [{ id: "a1", companyName: "Test Corp", lastActivityAt: "2024-01-01T00:00:00Z", staleDays: 20 }],
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]?.severity).toBe("warning"); // 20 days > 14
  });
});

describe("calculateKpiMetrics (Phase 23)", () => {
  it("calculates metrics from empty data", () => {
    const metrics = calculateKpiMetrics([], [], [], [], []);
    expect(metrics.totalSteps).toBe(0);
    expect(metrics.completionPercent).toBe(0);
    expect(metrics.gapResolutionPercent).toBe(0);
    expect(metrics.ocmAverageScore).toBe(0);
  });

  it("calculates correct step classification counts", () => {
    const steps = [
      { fitStatus: "FIT" },
      { fitStatus: "FIT" },
      { fitStatus: "CONFIGURE" },
      { fitStatus: "GAP" },
      { fitStatus: "NA" },
      { fitStatus: "PENDING" },
    ];
    const metrics = calculateKpiMetrics(steps, [], [], [], []);
    expect(metrics.totalSteps).toBe(6);
    expect(metrics.fitCount).toBe(2);
    expect(metrics.configureCount).toBe(1);
    expect(metrics.gapCount).toBe(1);
    expect(metrics.naCount).toBe(1);
    expect(metrics.pendingCount).toBe(1);
    expect(metrics.completedSteps).toBe(5);
    expect(metrics.completionPercent).toBe(83);
  });

  it("calculates gap resolution percentage", () => {
    const gaps = [
      { resolutionType: "CUSTOM_DEV" },
      { resolutionType: "PENDING" },
      { resolutionType: "WORKAROUND" },
    ];
    const metrics = calculateKpiMetrics([], gaps, [], [], []);
    expect(metrics.totalGaps).toBe(3);
    expect(metrics.resolvedGaps).toBe(2);
    expect(metrics.gapResolutionPercent).toBe(67);
  });

  it("calculates OCM metrics", () => {
    const ocmImpacts = [
      { impactScore: 5 },
      { impactScore: 3 },
      { impactScore: 4 },
      { impactScore: 2 },
    ];
    const metrics = calculateKpiMetrics([], [], [], [], ocmImpacts);
    expect(metrics.ocmAverageScore).toBe(4); // Math.round(14/4) = 4
    expect(metrics.ocmHighImpactCount).toBe(2); // scores >= 4
  });

  it("calculates integration and migration percentages", () => {
    const integrations = [
      { status: "completed" },
      { status: "in_progress" },
      { status: "completed" },
    ];
    const migrations = [
      { status: "COMPLETED" },
      { status: "pending" },
    ];
    const metrics = calculateKpiMetrics([], [], integrations, migrations, []);
    expect(metrics.integrationPercent).toBe(67);
    expect(metrics.migrationPercent).toBe(50);
  });
});
