import { describe, it, expect } from "vitest";
import { calculateGapRollups } from "@/lib/assessment/gap-rollups";

describe("calculateGapRollups", () => {
  it("returns zeros for empty gaps array", () => {
    const result = calculateGapRollups([]);
    expect(result.totalOneTimeCost).toBe(0);
    expect(result.totalRecurringCost).toBe(0);
    expect(result.totalImplementationDays).toBe(0);
    expect(Object.keys(result.byResolutionType)).toHaveLength(0);
    expect(Object.keys(result.byRiskCategory)).toHaveLength(0);
    expect(Object.keys(result.byPriority)).toHaveLength(0);
  });

  it("aggregates total costs correctly", () => {
    const gaps = [
      { resolutionType: "CUSTOM_ABAP", oneTimeCost: 5000, recurringCost: 1000, implementationDays: 10 },
      { resolutionType: "BTP_EXT", oneTimeCost: 15000, recurringCost: 3000, implementationDays: 20 },
      { resolutionType: "CONFIGURE", oneTimeCost: 2000, recurringCost: 0, implementationDays: 3 },
    ];
    const result = calculateGapRollups(gaps);
    expect(result.totalOneTimeCost).toBe(22000);
    expect(result.totalRecurringCost).toBe(4000);
    expect(result.totalImplementationDays).toBe(33);
  });

  it("treats null costs as zero", () => {
    const gaps = [
      { resolutionType: "CONFIGURE", oneTimeCost: null, recurringCost: null, implementationDays: null },
      { resolutionType: "FIT", oneTimeCost: 1000, recurringCost: null, implementationDays: 5 },
    ];
    const result = calculateGapRollups(gaps);
    expect(result.totalOneTimeCost).toBe(1000);
    expect(result.totalRecurringCost).toBe(0);
    expect(result.totalImplementationDays).toBe(5);
  });

  it("groups by resolution type", () => {
    const gaps = [
      { resolutionType: "CUSTOM_ABAP", oneTimeCost: 5000, recurringCost: 1000, implementationDays: 10 },
      { resolutionType: "CUSTOM_ABAP", oneTimeCost: 3000, recurringCost: 500, implementationDays: 5 },
      { resolutionType: "BTP_EXT", oneTimeCost: 10000, recurringCost: 2000, implementationDays: 15 },
    ];
    const result = calculateGapRollups(gaps);

    expect(result.byResolutionType["CUSTOM_ABAP"]).toEqual({
      oneTime: 8000,
      recurring: 1500,
      days: 15,
    });
    expect(result.byResolutionType["BTP_EXT"]).toEqual({
      oneTime: 10000,
      recurring: 2000,
      days: 15,
    });
  });

  it("groups by risk category", () => {
    const gaps = [
      { resolutionType: "CUSTOM_ABAP", riskCategory: "technical", oneTimeCost: 5000, recurringCost: 1000 },
      { resolutionType: "BTP_EXT", riskCategory: "technical", oneTimeCost: 3000, recurringCost: 500 },
      { resolutionType: "ISV", riskCategory: "compliance", oneTimeCost: 10000, recurringCost: 2000 },
    ];
    const result = calculateGapRollups(gaps);

    expect(result.byRiskCategory["technical"]).toEqual({
      oneTime: 8000,
      recurring: 1500,
      count: 2,
    });
    expect(result.byRiskCategory["compliance"]).toEqual({
      oneTime: 10000,
      recurring: 2000,
      count: 1,
    });
  });

  it("skips null risk category in grouping", () => {
    const gaps = [
      { resolutionType: "CONFIGURE", riskCategory: null, oneTimeCost: 1000 },
      { resolutionType: "BTP_EXT", riskCategory: "business", oneTimeCost: 5000 },
    ];
    const result = calculateGapRollups(gaps);
    expect(Object.keys(result.byRiskCategory)).toEqual(["business"]);
  });

  it("groups by priority", () => {
    const gaps = [
      { resolutionType: "CUSTOM_ABAP", priority: "critical", oneTimeCost: 10000, recurringCost: 2000 },
      { resolutionType: "BTP_EXT", priority: "critical", oneTimeCost: 5000, recurringCost: 1000 },
      { resolutionType: "CONFIGURE", priority: "low", oneTimeCost: 500, recurringCost: 0 },
    ];
    const result = calculateGapRollups(gaps);

    expect(result.byPriority["critical"]).toEqual({
      oneTime: 15000,
      recurring: 3000,
      count: 2,
    });
    expect(result.byPriority["low"]).toEqual({
      oneTime: 500,
      recurring: 0,
      count: 1,
    });
  });

  it("skips null priority in grouping", () => {
    const gaps = [
      { resolutionType: "CONFIGURE", priority: null, oneTimeCost: 1000 },
      { resolutionType: "FIT" },
    ];
    const result = calculateGapRollups(gaps);
    expect(Object.keys(result.byPriority)).toHaveLength(0);
  });

  it("handles gaps with only resolutionType (no optional fields)", () => {
    const gaps = [
      { resolutionType: "FIT" },
      { resolutionType: "PENDING" },
    ];
    const result = calculateGapRollups(gaps);
    expect(result.totalOneTimeCost).toBe(0);
    expect(result.totalRecurringCost).toBe(0);
    expect(result.totalImplementationDays).toBe(0);
    expect(Object.keys(result.byResolutionType)).toHaveLength(2);
    expect(result.byResolutionType["FIT"]).toEqual({ oneTime: 0, recurring: 0, days: 0 });
  });
});
