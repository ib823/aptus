import { describe, it, expect } from "vitest";
import {
  computeCostRollup,
  computeRiskHeatMap,
  analyzeUpgradeImpact,
} from "@/lib/assessment/gap-analytics";

describe("computeCostRollup", () => {
  it("returns zeros for empty gaps array", () => {
    const result = computeCostRollup([]);
    expect(result.totalOneTimeCost).toBe(0);
    expect(result.totalRecurringCost).toBe(0);
    expect(result.totalImplementationDays).toBe(0);
    expect(Object.keys(result.byCurrency)).toHaveLength(0);
    expect(Object.keys(result.byResolutionType)).toHaveLength(0);
  });

  it("excludes PENDING gaps from totals", () => {
    const gaps = [
      { id: "g1", resolutionType: "PENDING", oneTimeCost: 5000, recurringCost: 1000, implementationDays: 10 },
      { id: "g2", resolutionType: "CONFIGURE", oneTimeCost: 2000, recurringCost: 500, implementationDays: 3 },
    ];
    const result = computeCostRollup(gaps);
    expect(result.totalOneTimeCost).toBe(2000);
    expect(result.totalRecurringCost).toBe(500);
    expect(result.totalImplementationDays).toBe(3);
  });

  it("aggregates totals across all resolved gaps", () => {
    const gaps = [
      { id: "g1", resolutionType: "CUSTOM_ABAP", oneTimeCost: 5000, recurringCost: 1000, implementationDays: 10 },
      { id: "g2", resolutionType: "BTP_EXT", oneTimeCost: 15000, recurringCost: 3000, implementationDays: 20 },
      { id: "g3", resolutionType: "CONFIGURE", oneTimeCost: 2000, recurringCost: 0, implementationDays: 3 },
    ];
    const result = computeCostRollup(gaps);
    expect(result.totalOneTimeCost).toBe(22000);
    expect(result.totalRecurringCost).toBe(4000);
    expect(result.totalImplementationDays).toBe(33);
  });

  it("treats null costs as zero", () => {
    const gaps = [
      { id: "g1", resolutionType: "CONFIGURE", oneTimeCost: null, recurringCost: null, implementationDays: null },
      { id: "g2", resolutionType: "FIT", oneTimeCost: 1000, recurringCost: null, implementationDays: 5 },
    ];
    const result = computeCostRollup(gaps);
    expect(result.totalOneTimeCost).toBe(1000);
    expect(result.totalRecurringCost).toBe(0);
    expect(result.totalImplementationDays).toBe(5);
  });

  it("groups by resolution type with count", () => {
    const gaps = [
      { id: "g1", resolutionType: "CUSTOM_ABAP", oneTimeCost: 5000, recurringCost: 1000, implementationDays: 10 },
      { id: "g2", resolutionType: "CUSTOM_ABAP", oneTimeCost: 3000, recurringCost: 500, implementationDays: 5 },
      { id: "g3", resolutionType: "BTP_EXT", oneTimeCost: 10000, recurringCost: 2000, implementationDays: 15 },
    ];
    const result = computeCostRollup(gaps);
    expect(result.byResolutionType["CUSTOM_ABAP"]).toEqual({
      count: 2,
      oneTime: 8000,
      recurring: 1500,
      days: 15,
    });
    expect(result.byResolutionType["BTP_EXT"]).toEqual({
      count: 1,
      oneTime: 10000,
      recurring: 2000,
      days: 15,
    });
  });

  it("groups by currency defaulting to USD", () => {
    const gaps = [
      { id: "g1", resolutionType: "CONFIGURE", oneTimeCost: 1000, costCurrency: "EUR" },
      { id: "g2", resolutionType: "FIT", oneTimeCost: 2000 },
    ];
    const result = computeCostRollup(gaps);
    expect(result.byCurrency["EUR"]).toBeDefined();
    expect(result.byCurrency["EUR"]!.oneTime).toBe(1000);
    expect(result.byCurrency["USD"]).toBeDefined();
    expect(result.byCurrency["USD"]!.oneTime).toBe(2000);
  });
});

describe("computeRiskHeatMap", () => {
  it("returns 12 empty cells for empty gaps", () => {
    const result = computeRiskHeatMap([]);
    expect(result.cells).toHaveLength(12);
    expect(result.totalCategorized).toBe(0);
    expect(result.totalUncategorized).toBe(0);
    for (const cell of result.cells) {
      expect(cell.count).toBe(0);
      expect(cell.gapIds).toHaveLength(0);
    }
  });

  it("categorizes gaps into correct cells", () => {
    const gaps = [
      { id: "g1", resolutionType: "CUSTOM_ABAP", riskCategory: "technical", riskLevel: "HIGH" },
      { id: "g2", resolutionType: "BTP_EXT", riskCategory: "technical", riskLevel: "HIGH" },
      { id: "g3", resolutionType: "CONFIGURE", riskCategory: "business", riskLevel: "LOW" },
    ];
    const result = computeRiskHeatMap(gaps);
    expect(result.totalCategorized).toBe(3);
    expect(result.totalUncategorized).toBe(0);

    const techHigh = result.cells.find((c) => c.category === "technical" && c.level === "HIGH");
    expect(techHigh!.count).toBe(2);
    expect(techHigh!.gapIds).toEqual(["g1", "g2"]);

    const bizLow = result.cells.find((c) => c.category === "business" && c.level === "LOW");
    expect(bizLow!.count).toBe(1);
  });

  it("counts uncategorized gaps (missing riskCategory or riskLevel)", () => {
    const gaps = [
      { id: "g1", resolutionType: "CONFIGURE", riskCategory: null, riskLevel: "LOW" },
      { id: "g2", resolutionType: "FIT", riskCategory: "technical", riskLevel: null },
      { id: "g3", resolutionType: "ISV", riskCategory: "compliance", riskLevel: "MEDIUM" },
    ];
    const result = computeRiskHeatMap(gaps);
    expect(result.totalCategorized).toBe(1);
    expect(result.totalUncategorized).toBe(2);
  });

  it("covers all 4 categories and 3 levels", () => {
    const result = computeRiskHeatMap([]);
    const categories = new Set(result.cells.map((c) => c.category));
    const levels = new Set(result.cells.map((c) => c.level));
    expect(categories).toEqual(new Set(["technical", "business", "compliance", "integration"]));
    expect(levels).toEqual(new Set(["LOW", "MEDIUM", "HIGH"]));
  });
});

describe("analyzeUpgradeImpact", () => {
  it("returns empty counts for empty gaps", () => {
    const result = analyzeUpgradeImpact([]);
    expect(result.upgradeUnsafeCount).toBe(0);
    expect(Object.keys(result.upgradeStrategyCounts)).toHaveLength(0);
    expect(result.upgradeUnsafeResolutions).toHaveLength(0);
  });

  it("excludes PENDING gaps", () => {
    const gaps = [
      { id: "g1", resolutionType: "PENDING" },
      { id: "g2", resolutionType: "CONFIGURE" },
    ];
    const result = analyzeUpgradeImpact(gaps);
    expect(result.upgradeStrategyCounts["standard_upgrade"]).toBe(1);
    expect(Object.values(result.upgradeStrategyCounts).reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("infers custom_maintenance for CUSTOM_ABAP and ISV", () => {
    const gaps = [
      { id: "g1", resolutionType: "CUSTOM_ABAP" },
      { id: "g2", resolutionType: "ISV" },
    ];
    const result = analyzeUpgradeImpact(gaps);
    expect(result.upgradeStrategyCounts["custom_maintenance"]).toBe(2);
    expect(result.upgradeUnsafeCount).toBe(2);
    expect(result.upgradeUnsafeResolutions).toHaveLength(2);
  });

  it("infers needs_revalidation for BTP_EXT and KEY_USER_EXT", () => {
    const gaps = [
      { id: "g1", resolutionType: "BTP_EXT" },
      { id: "g2", resolutionType: "KEY_USER_EXT" },
    ];
    const result = analyzeUpgradeImpact(gaps);
    expect(result.upgradeStrategyCounts["needs_revalidation"]).toBe(2);
    expect(result.upgradeUnsafeCount).toBe(0);
  });

  it("infers standard_upgrade for FIT, CONFIGURE, ADAPT_PROCESS, OUT_OF_SCOPE", () => {
    const gaps = [
      { id: "g1", resolutionType: "FIT" },
      { id: "g2", resolutionType: "CONFIGURE" },
      { id: "g3", resolutionType: "ADAPT_PROCESS" },
      { id: "g4", resolutionType: "OUT_OF_SCOPE" },
    ];
    const result = analyzeUpgradeImpact(gaps);
    expect(result.upgradeStrategyCounts["standard_upgrade"]).toBe(4);
    expect(result.upgradeUnsafeCount).toBe(0);
  });

  it("uses explicit upgradeStrategy when set", () => {
    const gaps = [
      { id: "g1", resolutionType: "CUSTOM_ABAP", upgradeStrategy: "standard_upgrade" },
    ];
    const result = analyzeUpgradeImpact(gaps);
    expect(result.upgradeStrategyCounts["standard_upgrade"]).toBe(1);
    expect(result.upgradeUnsafeCount).toBe(0);
  });

  it("populates upgradeUnsafeResolutions with gap details", () => {
    const gaps = [
      { id: "g1", resolutionType: "CUSTOM_ABAP", resolutionDescription: "Custom report" },
    ];
    const result = analyzeUpgradeImpact(gaps);
    expect(result.upgradeUnsafeResolutions[0]).toEqual({
      gapId: "g1",
      resolutionType: "CUSTOM_ABAP",
      upgradeStrategy: "custom_maintenance",
      description: "Custom report",
    });
  });
});
