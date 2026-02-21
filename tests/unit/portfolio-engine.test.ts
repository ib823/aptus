import { describe, it, expect } from "vitest";
import {
  computePortfolioSummary,
  computeFitRateByIndustry,
  computeTopGaps,
} from "@/lib/analytics/portfolio-engine";

describe("computePortfolioSummary", () => {
  it("should compute summary for a set of assessments", () => {
    const assessments = [
      {
        status: "in_progress",
        stepResponses: [
          { fitStatus: "FIT" },
          { fitStatus: "FIT" },
          { fitStatus: "GAP" },
          { fitStatus: "CONFIGURE" },
        ],
        createdAt: new Date("2025-01-01"),
        completedAt: null,
      },
      {
        status: "completed",
        stepResponses: [
          { fitStatus: "FIT" },
          { fitStatus: "FIT" },
          { fitStatus: "FIT" },
          { fitStatus: "GAP" },
        ],
        createdAt: new Date("2025-01-01"),
        completedAt: new Date("2025-02-01"),
      },
    ];
    const result = computePortfolioSummary(assessments);
    expect(result.totalAssessments).toBe(2);
    expect(result.activeAssessments).toBe(1);
    expect(result.completedAssessments).toBe(1);
    expect(result.avgFitRate).toBeGreaterThan(0);
    expect(result.avgAssessmentDurationDays).toBeGreaterThan(0);
  });

  it("should return zeros for empty input", () => {
    const result = computePortfolioSummary([]);
    expect(result.totalAssessments).toBe(0);
    expect(result.activeAssessments).toBe(0);
    expect(result.completedAssessments).toBe(0);
    expect(result.avgFitRate).toBe(0);
    expect(result.avgAssessmentDurationDays).toBe(0);
  });

  it("should handle assessments without step responses", () => {
    const assessments = [
      {
        status: "draft",
        stepResponses: [],
        createdAt: new Date("2025-01-01"),
        completedAt: null,
      },
    ];
    const result = computePortfolioSummary(assessments);
    expect(result.totalAssessments).toBe(1);
    expect(result.avgFitRate).toBe(0);
  });

  it("should count active and completed statuses correctly", () => {
    const assessments = [
      { status: "draft", stepResponses: [], createdAt: new Date(), completedAt: null },
      { status: "scoping", stepResponses: [], createdAt: new Date(), completedAt: null },
      { status: "signed_off", stepResponses: [], createdAt: new Date(), completedAt: null },
      { status: "archived", stepResponses: [], createdAt: new Date(), completedAt: null },
    ];
    const result = computePortfolioSummary(assessments);
    expect(result.activeAssessments).toBe(2);
    expect(result.completedAssessments).toBe(2);
  });

  it("should compute average duration only from completed assessments with dates", () => {
    const assessments = [
      {
        status: "completed",
        stepResponses: [{ fitStatus: "FIT" }],
        createdAt: new Date("2025-01-01"),
        completedAt: new Date("2025-01-11"), // 10 days
      },
      {
        status: "completed",
        stepResponses: [{ fitStatus: "FIT" }],
        createdAt: new Date("2025-01-01"),
        completedAt: new Date("2025-01-21"), // 20 days
      },
      {
        status: "in_progress",
        stepResponses: [{ fitStatus: "GAP" }],
        createdAt: new Date("2025-01-01"),
        completedAt: null,
      },
    ];
    const result = computePortfolioSummary(assessments);
    expect(result.avgAssessmentDurationDays).toBe(15);
  });

  it("should handle all assessments being active (no completed dates)", () => {
    const assessments = [
      {
        status: "in_progress",
        stepResponses: [{ fitStatus: "FIT" }],
        createdAt: new Date(),
        completedAt: null,
      },
    ];
    const result = computePortfolioSummary(assessments);
    expect(result.avgAssessmentDurationDays).toBe(0);
  });
});

describe("computeFitRateByIndustry", () => {
  it("should group by industry and compute average FIT rate", () => {
    const assessments = [
      {
        industry: "Manufacturing",
        stepResponses: [
          { fitStatus: "FIT" },
          { fitStatus: "FIT" },
          { fitStatus: "GAP" },
          { fitStatus: "GAP" },
        ],
      },
      {
        industry: "Manufacturing",
        stepResponses: [
          { fitStatus: "FIT" },
          { fitStatus: "FIT" },
          { fitStatus: "FIT" },
          { fitStatus: "GAP" },
        ],
      },
      {
        industry: "Retail",
        stepResponses: [
          { fitStatus: "FIT" },
          { fitStatus: "GAP" },
        ],
      },
    ];
    const result = computeFitRateByIndustry(assessments);
    expect(result).toHaveLength(2);

    const manufacturing = result.find((r) => r.industry === "Manufacturing");
    expect(manufacturing?.assessmentCount).toBe(2);
    // (50 + 75) / 2 = 62.5
    expect(manufacturing?.avgFitRate).toBe(62.5);
  });

  it("should skip assessments with no step responses", () => {
    const assessments = [
      { industry: "Manufacturing", stepResponses: [] },
      {
        industry: "Manufacturing",
        stepResponses: [{ fitStatus: "FIT" }],
      },
    ];
    const result = computeFitRateByIndustry(assessments);
    expect(result).toHaveLength(1);
    expect(result[0]?.assessmentCount).toBe(1);
  });

  it("should handle empty input", () => {
    expect(computeFitRateByIndustry([])).toEqual([]);
  });

  it("should sort by assessment count descending", () => {
    const assessments = [
      { industry: "A", stepResponses: [{ fitStatus: "FIT" }] },
      { industry: "B", stepResponses: [{ fitStatus: "FIT" }] },
      { industry: "B", stepResponses: [{ fitStatus: "FIT" }] },
    ];
    const result = computeFitRateByIndustry(assessments);
    expect(result[0]?.industry).toBe("B");
  });
});

describe("computeTopGaps", () => {
  it("should aggregate gaps by description", () => {
    const gaps = [
      { gapDescription: "Missing batch processing", resolutionType: "BTP_EXT" },
      { gapDescription: "Missing batch processing", resolutionType: "BTP_EXT" },
      { gapDescription: "No EDI support", resolutionType: "ISV" },
    ];
    const result = computeTopGaps(gaps);
    expect(result).toHaveLength(2);
    expect(result[0]?.frequency).toBe(2);
    expect(result[0]?.description).toBe("Missing batch processing");
  });

  it("should sort by frequency descending", () => {
    const gaps = [
      { gapDescription: "Gap A", resolutionType: "FIT" },
      { gapDescription: "Gap B", resolutionType: "FIT" },
      { gapDescription: "Gap B", resolutionType: "FIT" },
      { gapDescription: "Gap B", resolutionType: "FIT" },
    ];
    const result = computeTopGaps(gaps);
    expect(result[0]?.description).toBe("Gap B");
    expect(result[0]?.frequency).toBe(3);
  });

  it("should handle empty input", () => {
    expect(computeTopGaps([])).toEqual([]);
  });

  it("should truncate long descriptions", () => {
    const longDesc = "A".repeat(200);
    const gaps = [{ gapDescription: longDesc, resolutionType: "FIT" }];
    const result = computeTopGaps(gaps);
    expect(result[0]?.description.length).toBeLessThanOrEqual(100);
  });

  it("should treat different casing as same gap", () => {
    const gaps = [
      { gapDescription: "Missing Feature", resolutionType: "FIT" },
      { gapDescription: "missing feature", resolutionType: "FIT" },
    ];
    const result = computeTopGaps(gaps);
    expect(result).toHaveLength(1);
    expect(result[0]?.frequency).toBe(2);
  });
});
