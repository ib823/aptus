import { describe, it, expect } from "vitest";
import {
  mean,
  median,
  percentile,
  computeFitRate,
  computeBenchmarkComparison,
  generateInsights,
} from "@/lib/analytics/benchmark-engine";

describe("mean", () => {
  it("should compute mean of an array", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it("should return 0 for empty array", () => {
    expect(mean([])).toBe(0);
  });

  it("should handle single element", () => {
    expect(mean([42])).toBe(42);
  });

  it("should handle decimal values", () => {
    expect(mean([1.5, 2.5])).toBe(2);
  });
});

describe("median", () => {
  it("should compute median of odd-length sorted array", () => {
    expect(median([1, 2, 3])).toBe(2);
  });

  it("should compute median of even-length sorted array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("should return 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("should handle single element", () => {
    expect(median([5])).toBe(5);
  });

  it("should handle two elements", () => {
    expect(median([10, 20])).toBe(15);
  });
});

describe("percentile", () => {
  it("should compute 25th percentile", () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 25)).toBe(20);
  });

  it("should compute 75th percentile", () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 75)).toBe(40);
  });

  it("should compute 50th percentile (median)", () => {
    const values = [10, 20, 30, 40, 50];
    expect(percentile(values, 50)).toBe(30);
  });

  it("should return 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("should return the value for single element", () => {
    expect(percentile([42], 25)).toBe(42);
  });

  it("should interpolate between values", () => {
    const values = [0, 100];
    expect(percentile(values, 50)).toBe(50);
  });
});

describe("computeFitRate", () => {
  it("should return 100 when all responses are FIT", () => {
    const responses = [
      { fitStatus: "FIT" },
      { fitStatus: "FIT" },
      { fitStatus: "FIT" },
    ];
    expect(computeFitRate(responses)).toBe(100);
  });

  it("should return 0 when no responses are FIT", () => {
    const responses = [
      { fitStatus: "GAP" },
      { fitStatus: "CONFIGURE" },
      { fitStatus: "NA" },
    ];
    expect(computeFitRate(responses)).toBe(0);
  });

  it("should return correct rate for mixed responses", () => {
    const responses = [
      { fitStatus: "FIT" },
      { fitStatus: "GAP" },
      { fitStatus: "FIT" },
      { fitStatus: "CONFIGURE" },
    ];
    expect(computeFitRate(responses)).toBe(50);
  });

  it("should return 0 for empty array", () => {
    expect(computeFitRate([])).toBe(0);
  });

  it("should be case-insensitive", () => {
    const responses = [
      { fitStatus: "fit" },
      { fitStatus: "Fit" },
      { fitStatus: "FIT" },
    ];
    expect(computeFitRate(responses)).toBe(100);
  });
});

/**
 * Every case here now passes a sampleSize. The comparison is suppressed below
 * MINIMUM_BENCHMARK_SAMPLE_SIZE and when the cohort has no quartiles; the
 * suppression itself is covered in benchmark-provenance.test.ts.
 */
describe("computeBenchmarkComparison", () => {
  const SUFFICIENT = 20;

  it("should return above_average when above p75", () => {
    const result = computeBenchmarkComparison(90, {
      avgFitRate: 70,
      p25FitRate: 60,
      p75FitRate: 80,
      sampleSize: SUFFICIENT,
    });
    expect(result?.fitRatePercentile).toBe("above_average");
    expect(result?.fitRateDelta).toBe(20);
  });

  it("should return below_average when below p25", () => {
    const result = computeBenchmarkComparison(50, {
      avgFitRate: 70,
      p25FitRate: 60,
      p75FitRate: 80,
      sampleSize: SUFFICIENT,
    });
    expect(result?.fitRatePercentile).toBe("below_average");
    expect(result?.fitRateDelta).toBe(-20);
  });

  it("should return average when between p25 and p75", () => {
    const result = computeBenchmarkComparison(65, {
      avgFitRate: 70,
      p25FitRate: 60,
      p75FitRate: 80,
      sampleSize: SUFFICIENT,
    });
    expect(result?.fitRatePercentile).toBe("average");
  });

  it("returns null rather than inventing a position when percentiles are null", () => {
    // Was: an "average plus or minus 5 points" fallback that reported
    // above_average / below_average from a mean alone.
    expect(
      computeBenchmarkComparison(80, {
        avgFitRate: 70,
        p25FitRate: null,
        p75FitRate: null,
        sampleSize: SUFFICIENT,
      }),
    ).toBeNull();

    expect(
      computeBenchmarkComparison(60, {
        avgFitRate: 70,
        p25FitRate: null,
        p75FitRate: null,
        sampleSize: SUFFICIENT,
      }),
    ).toBeNull();
  });
});

describe("generateInsights", () => {
  const DIST = { avgFitRate: 70, p25FitRate: 60, p75FitRate: 80 };

  it("places an assessment above the upper quartile", () => {
    const insights = generateInsights(85, { ...DIST, sampleSize: 10 });
    expect(insights.some((i) => i.includes("above the upper quartile"))).toBe(true);
  });

  it("places an assessment below the lower quartile, with a review suggestion", () => {
    const insights = generateInsights(50, { ...DIST, sampleSize: 10 });
    expect(insights.some((i) => i.includes("below the lower quartile"))).toBe(true);
    expect(insights.some((i) => i.includes("gap resolutions"))).toBe(true);
  });

  it("names the cohort size", () => {
    const insights = generateInsights(70, { ...DIST, sampleSize: 25 });
    expect(insights.some((i) => i.includes("25 comparable ABeam engagements"))).toBe(true);
  });

  it("attributes the delta to the cohort mean, never to an industry average", () => {
    const insights = generateInsights(80, { ...DIST, sampleSize: 10 });
    expect(insights.some((i) => i.includes("above the mean of"))).toBe(true);
    // "same industry and company size" describes the cohort filter and is fine.
    // "the industry average" claims a panel that does not exist and is not.
    expect(insights.join(" ")).not.toMatch(/industry (average|benchmark)/i);
  });

  it("places an assessment sitting on the mean inside the middle quartiles", () => {
    const insights = generateInsights(70, { ...DIST, sampleSize: 10 });
    expect(insights.some((i) => i.includes("middle two quartiles"))).toBe(true);
  });
});
