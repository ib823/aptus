import { describe, it, expect } from "vitest";
import { suggestResolutions } from "@/lib/assessment/gap-suggest";

const mockPatterns = [
  {
    id: "p1",
    description: "Custom report for accounts payable aging analysis with vendor details",
    resolutionType: "CUSTOM_ABAP",
    effortDays: 10,
    riskLevel: "MEDIUM",
  },
  {
    id: "p2",
    description: "BTP integration for external warehouse management system",
    resolutionType: "BTP_EXT",
    effortDays: 20,
    riskLevel: "HIGH",
  },
  {
    id: "p3",
    description: "Configure standard output management for purchase order printing",
    resolutionType: "CONFIGURE",
    effortDays: 3,
    riskLevel: "LOW",
  },
  {
    id: "p4",
    description: "Key user extension for custom approval workflow in procurement",
    resolutionType: "KEY_USER_EXT",
    effortDays: 5,
    riskLevel: "LOW",
  },
  {
    id: "p5",
    description: "ISV solution for advanced tax calculation and compliance reporting",
    resolutionType: "ISV",
    effortDays: 15,
    riskLevel: "MEDIUM",
  },
];

describe("suggestResolutions", () => {
  it("returns empty array for empty description", () => {
    expect(suggestResolutions("", mockPatterns)).toEqual([]);
  });

  it("returns empty array for empty patterns", () => {
    expect(suggestResolutions("some gap description", [])).toEqual([]);
  });

  it("returns empty array when description has only short words", () => {
    // tokenize filters words <= 2 chars
    expect(suggestResolutions("a b c", mockPatterns)).toEqual([]);
  });

  it("finds matching pattern with high similarity", () => {
    const results = suggestResolutions(
      "Custom report for accounts payable aging analysis",
      mockPatterns,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.patternId).toBe("p1");
    expect(results[0]!.resolutionType).toBe("CUSTOM_ABAP");
    expect(results[0]!.matchScore).toBeGreaterThan(0.5);
  });

  it("returns results sorted by match score descending", () => {
    const results = suggestResolutions(
      "integration for external warehouse management system with custom report",
      mockPatterns,
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.matchScore).toBeLessThanOrEqual(results[i - 1]!.matchScore);
    }
  });

  it("returns at most 3 results", () => {
    // Create many similar patterns
    const manyPatterns = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      description: "custom report for accounts payable aging analysis vendor details integration",
      resolutionType: "CUSTOM_ABAP",
    }));
    const results = suggestResolutions(
      "custom report for accounts payable aging analysis vendor details integration",
      manyPatterns,
    );
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("filters out patterns below 0.15 similarity threshold", () => {
    const results = suggestResolutions(
      "completely unrelated topic about quantum physics experiments",
      mockPatterns,
    );
    for (const r of results) {
      expect(r.matchScore).toBeGreaterThanOrEqual(0.15);
    }
  });

  it("includes effortDays and riskLevel from pattern", () => {
    const results = suggestResolutions(
      "Custom report for accounts payable aging analysis",
      mockPatterns,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.effortDays).toBe(10);
    expect(results[0]!.riskLevel).toBe("MEDIUM");
  });

  it("rounds match score to 2 decimal places", () => {
    const results = suggestResolutions(
      "custom report accounts payable",
      mockPatterns,
    );
    for (const r of results) {
      const str = r.matchScore.toString();
      const decimals = str.includes(".") ? str.split(".")[1]!.length : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });

  it("identical strings produce score of 1.0", () => {
    const desc = "Custom report for accounts payable aging analysis with vendor details";
    const results = suggestResolutions(desc, [
      { id: "exact", description: desc, resolutionType: "CUSTOM_ABAP" },
    ]);
    expect(results.length).toBe(1);
    expect(results[0]!.matchScore).toBe(1);
  });

  it("completely disjoint strings produce no results", () => {
    const results = suggestResolutions(
      "xylophone zebra platypus",
      [{ id: "x", description: "configure standard output management", resolutionType: "CONFIGURE" }],
    );
    expect(results).toEqual([]);
  });
});
