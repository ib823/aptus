import { describe, it, expect } from "vitest";
import {
  computeScopeDelta,
  computeClassificationDelta,
  generateTrendInsights,
} from "@/lib/analytics/scope-delta";

describe("computeScopeDelta", () => {
  it("should detect added scope items", () => {
    const phase1 = [{ scopeItemId: "J60", relevance: "YES" }];
    const phase2 = [
      { scopeItemId: "J60", relevance: "YES" },
      { scopeItemId: "J61", relevance: "YES" },
    ];
    const result = computeScopeDelta(phase1, phase2);
    expect(result.added).toEqual(["J61"]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it("should detect removed scope items", () => {
    const phase1 = [
      { scopeItemId: "J60", relevance: "YES" },
      { scopeItemId: "J61", relevance: "YES" },
    ];
    const phase2 = [{ scopeItemId: "J60", relevance: "YES" }];
    const result = computeScopeDelta(phase1, phase2);
    expect(result.removed).toEqual(["J61"]);
    expect(result.added).toEqual([]);
  });

  it("should detect changed relevance", () => {
    const phase1 = [{ scopeItemId: "J60", relevance: "YES" }];
    const phase2 = [{ scopeItemId: "J60", relevance: "NO" }];
    const result = computeScopeDelta(phase1, phase2);
    expect(result.changed).toEqual([
      { scopeItemId: "J60", from: "YES", to: "NO" },
    ]);
  });

  it("should return empty deltas for identical scopes", () => {
    const phase1 = [
      { scopeItemId: "J60", relevance: "YES" },
      { scopeItemId: "J61", relevance: "NO" },
    ];
    const result = computeScopeDelta(phase1, [...phase1]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it("should handle completely disjoint scopes", () => {
    const phase1 = [{ scopeItemId: "J60", relevance: "YES" }];
    const phase2 = [{ scopeItemId: "J61", relevance: "YES" }];
    const result = computeScopeDelta(phase1, phase2);
    expect(result.added).toEqual(["J61"]);
    expect(result.removed).toEqual(["J60"]);
  });

  it("should handle empty phases", () => {
    expect(computeScopeDelta([], []).added).toEqual([]);
    expect(computeScopeDelta([], [{ scopeItemId: "J60", relevance: "YES" }]).added).toEqual(["J60"]);
    expect(computeScopeDelta([{ scopeItemId: "J60", relevance: "YES" }], []).removed).toEqual(["J60"]);
  });

  it("should handle multiple changes simultaneously", () => {
    const phase1 = [
      { scopeItemId: "J60", relevance: "YES" },
      { scopeItemId: "J61", relevance: "NO" },
      { scopeItemId: "J62", relevance: "MAYBE" },
    ];
    const phase2 = [
      { scopeItemId: "J60", relevance: "NO" },
      { scopeItemId: "J63", relevance: "YES" },
    ];
    const result = computeScopeDelta(phase1, phase2);
    expect(result.added).toEqual(["J63"]);
    expect(result.removed).toContain("J61");
    expect(result.removed).toContain("J62");
    expect(result.changed).toEqual([{ scopeItemId: "J60", from: "YES", to: "NO" }]);
  });
});

describe("computeClassificationDelta", () => {
  it("should detect FIT to GAP changes", () => {
    const p1 = [{ processStepId: "s1", fitStatus: "FIT" }];
    const p2 = [{ processStepId: "s1", fitStatus: "GAP" }];
    const result = computeClassificationDelta(p1, p2);
    expect(result.fitToGap).toBe(1);
  });

  it("should detect GAP to FIT changes", () => {
    const p1 = [{ processStepId: "s1", fitStatus: "GAP" }];
    const p2 = [{ processStepId: "s1", fitStatus: "FIT" }];
    const result = computeClassificationDelta(p1, p2);
    expect(result.gapToFit).toBe(1);
  });

  it("should detect FIT to CONFIGURE changes", () => {
    const p1 = [{ processStepId: "s1", fitStatus: "FIT" }];
    const p2 = [{ processStepId: "s1", fitStatus: "CONFIGURE" }];
    const result = computeClassificationDelta(p1, p2);
    expect(result.fitToConfig).toBe(1);
  });

  it("should detect new and removed items", () => {
    const p1 = [{ processStepId: "s1", fitStatus: "FIT" }];
    const p2 = [{ processStepId: "s2", fitStatus: "GAP" }];
    const result = computeClassificationDelta(p1, p2);
    expect(result.removedItems).toBe(1);
    expect(result.newItems).toBe(1);
  });

  it("should handle empty inputs", () => {
    const result = computeClassificationDelta([], []);
    expect(result.fitToGap).toBe(0);
    expect(result.gapToFit).toBe(0);
    expect(result.newItems).toBe(0);
    expect(result.removedItems).toBe(0);
  });

  it("should be case-insensitive", () => {
    const p1 = [{ processStepId: "s1", fitStatus: "fit" }];
    const p2 = [{ processStepId: "s1", fitStatus: "GAP" }];
    const result = computeClassificationDelta(p1, p2);
    expect(result.fitToGap).toBe(1);
  });

  it("should handle multiple changes", () => {
    const p1 = [
      { processStepId: "s1", fitStatus: "FIT" },
      { processStepId: "s2", fitStatus: "GAP" },
      { processStepId: "s3", fitStatus: "CONFIGURE" },
    ];
    const p2 = [
      { processStepId: "s1", fitStatus: "GAP" },
      { processStepId: "s2", fitStatus: "FIT" },
      { processStepId: "s3", fitStatus: "FIT" },
    ];
    const result = computeClassificationDelta(p1, p2);
    expect(result.fitToGap).toBe(1);
    expect(result.gapToFit).toBe(1);
    expect(result.configToFit).toBe(1);
  });
});

describe("generateTrendInsights", () => {
  it("should generate improvement insight when FIT rate increases", () => {
    const insights = generateTrendInsights(
      { added: [], removed: [], changed: [] },
      { fitToGap: 0, gapToFit: 2, fitToConfig: 0, configToFit: 0, newItems: 0, removedItems: 0 },
      60,
      75,
    );
    expect(insights.some((i) => i.includes("improved"))).toBe(true);
  });

  it("should generate decrease insight when FIT rate drops", () => {
    const insights = generateTrendInsights(
      { added: [], removed: [], changed: [] },
      { fitToGap: 2, gapToFit: 0, fitToConfig: 0, configToFit: 0, newItems: 0, removedItems: 0 },
      75,
      60,
    );
    expect(insights.some((i) => i.includes("decreased"))).toBe(true);
  });

  it("should note unchanged FIT rate", () => {
    const insights = generateTrendInsights(
      { added: [], removed: [], changed: [] },
      { fitToGap: 0, gapToFit: 0, fitToConfig: 0, configToFit: 0, newItems: 0, removedItems: 0 },
      70,
      70,
    );
    expect(insights.some((i) => i.includes("remained unchanged"))).toBe(true);
  });

  it("should mention added scope items", () => {
    const insights = generateTrendInsights(
      { added: ["J60", "J61"], removed: [], changed: [] },
      { fitToGap: 0, gapToFit: 0, fitToConfig: 0, configToFit: 0, newItems: 0, removedItems: 0 },
      70,
      70,
    );
    expect(insights.some((i) => i.includes("2 scope item(s) were added"))).toBe(true);
  });

  it("should mention removed scope items", () => {
    const insights = generateTrendInsights(
      { added: [], removed: ["J60"], changed: [] },
      { fitToGap: 0, gapToFit: 0, fitToConfig: 0, configToFit: 0, newItems: 0, removedItems: 0 },
      70,
      70,
    );
    expect(insights.some((i) => i.includes("1 scope item(s) were removed"))).toBe(true);
  });

  it("should mention GAP to FIT improvements", () => {
    const insights = generateTrendInsights(
      { added: [], removed: [], changed: [] },
      { fitToGap: 0, gapToFit: 3, fitToConfig: 0, configToFit: 0, newItems: 0, removedItems: 0 },
      60,
      75,
    );
    expect(insights.some((i) => i.includes("3 step(s) improved from GAP to FIT"))).toBe(true);
  });

  it("should mention FIT to GAP regressions", () => {
    const insights = generateTrendInsights(
      { added: [], removed: [], changed: [] },
      { fitToGap: 2, gapToFit: 0, fitToConfig: 0, configToFit: 0, newItems: 0, removedItems: 0 },
      75,
      60,
    );
    expect(insights.some((i) => i.includes("2 step(s) regressed from FIT to GAP"))).toBe(true);
  });
});
