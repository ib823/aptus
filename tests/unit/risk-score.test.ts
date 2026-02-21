import { describe, it, expect } from "vitest";
import { computeRiskScore } from "@/lib/assessment/risk-score";

describe("computeRiskScore (Phase 20)", () => {
  it("returns 0 when totalSteps is 0", () => {
    expect(computeRiskScore(0, 0, 0, [])).toBe(0);
  });

  it("returns 0 for a perfect FIT assessment with no gaps or pending", () => {
    expect(computeRiskScore(10, 0, 0, [])).toBe(0);
  });

  it("returns higher score when more steps are gaps", () => {
    const lowGap = computeRiskScore(100, 5, 0, ["CONFIGURE", "CONFIGURE", "CONFIGURE", "CONFIGURE", "CONFIGURE"]);
    const highGap = computeRiskScore(100, 50, 0, Array(50).fill("CONFIGURE") as string[]);
    expect(highGap).toBeGreaterThan(lowGap);
  });

  it("returns higher score for unresolved gaps", () => {
    // 10 gaps, 10 resolutions => unresolvedRatio = 0
    const resolved = computeRiskScore(100, 10, 0, Array(10).fill("CONFIGURE") as string[]);
    // 10 gaps, 0 resolutions => unresolvedRatio = 1
    const unresolved = computeRiskScore(100, 10, 0, []);
    expect(unresolved).toBeGreaterThan(resolved);
  });

  it("weighs CUSTOM_ABAP higher than FIT resolutions", () => {
    const simple = computeRiskScore(100, 10, 0, Array(10).fill("FIT") as string[]);
    const complex = computeRiskScore(100, 10, 0, Array(10).fill("CUSTOM_ABAP") as string[]);
    expect(complex).toBeGreaterThan(simple);
  });

  it("accounts for pending ratio", () => {
    const noPending = computeRiskScore(100, 0, 0, []);
    const withPending = computeRiskScore(100, 0, 50, []);
    expect(withPending).toBeGreaterThan(noPending);
  });

  it("returns a value between 0 and 1", () => {
    // Worst case: all gaps, all pending, high complexity, no resolutions
    const worstCase = computeRiskScore(10, 10, 10, []);
    expect(worstCase).toBeGreaterThanOrEqual(0);
    expect(worstCase).toBeLessThanOrEqual(1);
  });

  it("handles unknown resolution types with default weight", () => {
    const score = computeRiskScore(100, 5, 0, ["UNKNOWN_TYPE"]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("produces expected formula result for known inputs", () => {
    // 100 steps, 20 gaps, 10 pending, 10 resolutions (all CONFIGURE weight=0.1)
    // gapDensity = 20/100 = 0.2 => * 0.4 = 0.08
    // unresolvedRatio = (20-10)/20 = 0.5 => * 0.3 = 0.15
    // avgComplexity = 0.1 => * 0.2 = 0.02
    // pendingRatio = 10/100 = 0.1 => * 0.1 = 0.01
    // total = 0.26
    const score = computeRiskScore(100, 20, 10, Array(10).fill("CONFIGURE") as string[]);
    expect(score).toBe(0.26);
  });
});
