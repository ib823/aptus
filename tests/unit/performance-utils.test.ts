/** Unit tests for performance-utils.ts (Phase 27) */

import { describe, it, expect } from "vitest";
import {
  isGoodVital,
  getVitalThresholds,
  aggregateVitals,
} from "@/lib/pwa/performance-utils";

describe("isGoodVital", () => {
  it("LCP below 2500 is good", () => {
    expect(isGoodVital("LCP", 2000)).toBe(true);
  });

  it("LCP at 2500 is not good", () => {
    expect(isGoodVital("LCP", 2500)).toBe(false);
  });

  it("FID below 100 is good", () => {
    expect(isGoodVital("FID", 50)).toBe(true);
  });

  it("FID at 100 is not good", () => {
    expect(isGoodVital("FID", 100)).toBe(false);
  });

  it("CLS below 0.1 is good", () => {
    expect(isGoodVital("CLS", 0.05)).toBe(true);
  });

  it("CLS at 0.1 is not good", () => {
    expect(isGoodVital("CLS", 0.1)).toBe(false);
  });

  it("INP below 200 is good", () => {
    expect(isGoodVital("INP", 150)).toBe(true);
  });

  it("INP at 200 is not good", () => {
    expect(isGoodVital("INP", 200)).toBe(false);
  });

  it("TTFB below 800 is good", () => {
    expect(isGoodVital("TTFB", 400)).toBe(true);
  });

  it("TTFB at 800 is not good", () => {
    expect(isGoodVital("TTFB", 800)).toBe(false);
  });

  it("FCP below 1800 is good", () => {
    expect(isGoodVital("FCP", 1200)).toBe(true);
  });

  it("FCP at 1800 is not good", () => {
    expect(isGoodVital("FCP", 1800)).toBe(false);
  });

  it("unknown metric returns false", () => {
    expect(isGoodVital("UNKNOWN", 0)).toBe(false);
  });
});

describe("getVitalThresholds", () => {
  it("returns correct LCP thresholds", () => {
    expect(getVitalThresholds("LCP")).toEqual({ good: 2500, needsImprovement: 4000 });
  });

  it("returns correct FID thresholds", () => {
    expect(getVitalThresholds("FID")).toEqual({ good: 100, needsImprovement: 300 });
  });

  it("returns correct CLS thresholds", () => {
    expect(getVitalThresholds("CLS")).toEqual({ good: 0.1, needsImprovement: 0.25 });
  });

  it("returns zeros for unknown metric", () => {
    expect(getVitalThresholds("UNKNOWN")).toEqual({ good: 0, needsImprovement: 0 });
  });
});

describe("aggregateVitals", () => {
  it("returns zeros for empty array", () => {
    expect(aggregateVitals([])).toEqual({ p50: 0, p75: 0, p95: 0 });
  });

  it("handles a single value", () => {
    expect(aggregateVitals([{ value: 100 }])).toEqual({ p50: 100, p75: 100, p95: 100 });
  });

  it("computes correct percentiles for multiple values", () => {
    const reports = [
      { value: 10 },
      { value: 20 },
      { value: 30 },
      { value: 40 },
      { value: 50 },
      { value: 60 },
      { value: 70 },
      { value: 80 },
      { value: 90 },
      { value: 100 },
    ];
    const result = aggregateVitals(reports);
    expect(result.p50).toBe(50);
    expect(result.p75).toBe(80);
    expect(result.p95).toBe(100);
  });

  it("sorts values before computing percentiles", () => {
    const reports = [{ value: 100 }, { value: 10 }, { value: 50 }];
    const result = aggregateVitals(reports);
    // sorted: [10, 50, 100]
    // p50: ceil(50/100 * 3) - 1 = 1 => 50
    // p75: ceil(75/100 * 3) - 1 = 2 => 100
    // p95: ceil(95/100 * 3) - 1 = 2 => 100
    expect(result.p50).toBe(50);
    expect(result.p75).toBe(100);
    expect(result.p95).toBe(100);
  });
});
