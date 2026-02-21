import { describe, it, expect } from "vitest";
import {
  calculateWeightedReadiness,
  generateHeatmapData,
} from "@/lib/assessment/ocm-scoring";

describe("calculateWeightedReadiness", () => {
  it("returns 0 for empty array", () => {
    expect(calculateWeightedReadiness([])).toBe(0);
  });

  it("returns 0 when all readiness scores are null", () => {
    const impacts = [
      { severity: "HIGH", readinessScore: null },
      { severity: "LOW", readinessScore: null },
    ];
    expect(calculateWeightedReadiness(impacts)).toBe(0);
  });

  it("returns exact score for a single impact", () => {
    const impacts = [{ severity: "MEDIUM", readinessScore: 0.8 }];
    expect(calculateWeightedReadiness(impacts)).toBe(0.8);
  });

  it("applies severity weights correctly", () => {
    // TRANSFORMATIONAL=4, HIGH=3
    // weighted = (0.5 * 4 + 1.0 * 3) / (4 + 3) = (2 + 3) / 7 = 5/7 ~= 0.71
    const impacts = [
      { severity: "TRANSFORMATIONAL", readinessScore: 0.5 },
      { severity: "HIGH", readinessScore: 1.0 },
    ];
    const result = calculateWeightedReadiness(impacts);
    expect(result).toBeCloseTo(5 / 7, 2);
  });

  it("skips null readiness scores in weighting", () => {
    const impacts = [
      { severity: "HIGH", readinessScore: 0.6 },
      { severity: "LOW", readinessScore: null },
      { severity: "MEDIUM", readinessScore: 0.4 },
    ];
    // HIGH(3)*0.6 + MEDIUM(2)*0.4 = 1.8 + 0.8 = 2.6
    // total weight = 3 + 2 = 5
    // result = 2.6 / 5 = 0.52
    const result = calculateWeightedReadiness(impacts);
    expect(result).toBe(0.52);
  });

  it("rounds to 2 decimal places", () => {
    const impacts = [
      { severity: "HIGH", readinessScore: 0.333 },
      { severity: "LOW", readinessScore: 0.666 },
    ];
    const result = calculateWeightedReadiness(impacts);
    const str = result.toString();
    const decimals = str.includes(".") ? str.split(".")[1]!.length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it("uses weight of 1 for unknown severity", () => {
    const impacts = [
      { severity: "UNKNOWN_SEVERITY", readinessScore: 0.5 },
    ];
    // Unknown defaults to weight 1, so result = 0.5 * 1 / 1 = 0.5
    expect(calculateWeightedReadiness(impacts)).toBe(0.5);
  });

  it("returns 0 for all-zero readiness scores", () => {
    const impacts = [
      { severity: "HIGH", readinessScore: 0 },
      { severity: "LOW", readinessScore: 0 },
    ];
    expect(calculateWeightedReadiness(impacts)).toBe(0);
  });
});

describe("generateHeatmapData", () => {
  it("returns empty array for empty input", () => {
    expect(generateHeatmapData([])).toEqual([]);
  });

  it("creates one cell per unique role-area combination", () => {
    const impacts = [
      { impactedRole: "AP Clerk", functionalArea: "Finance", severity: "HIGH" },
      { impactedRole: "AP Clerk", functionalArea: "Finance", severity: "LOW" },
      { impactedRole: "AP Clerk", functionalArea: "Procurement", severity: "MEDIUM" },
    ];
    const result = generateHeatmapData(impacts);
    expect(result.length).toBe(2);
  });

  it("uses 'Unassigned' for null functional area", () => {
    const impacts = [
      { impactedRole: "Manager", functionalArea: null, severity: "MEDIUM" },
    ];
    const result = generateHeatmapData(impacts);
    expect(result.length).toBe(1);
    expect(result[0]!.area).toBe("Unassigned");
  });

  it("counts impacts correctly in each cell", () => {
    const impacts = [
      { impactedRole: "Buyer", functionalArea: "Purchasing", severity: "LOW" },
      { impactedRole: "Buyer", functionalArea: "Purchasing", severity: "HIGH" },
      { impactedRole: "Buyer", functionalArea: "Purchasing", severity: "MEDIUM" },
    ];
    const result = generateHeatmapData(impacts);
    expect(result.length).toBe(1);
    expect(result[0]!.count).toBe(3);
  });

  it("promotes severity to the highest in a cell", () => {
    const impacts = [
      { impactedRole: "Buyer", functionalArea: "Purchasing", severity: "LOW" },
      { impactedRole: "Buyer", functionalArea: "Purchasing", severity: "TRANSFORMATIONAL" },
      { impactedRole: "Buyer", functionalArea: "Purchasing", severity: "MEDIUM" },
    ];
    const result = generateHeatmapData(impacts);
    expect(result[0]!.severity).toBe("TRANSFORMATIONAL");
  });

  it("handles multiple distinct cells", () => {
    const impacts = [
      { impactedRole: "A", functionalArea: "X", severity: "LOW" },
      { impactedRole: "A", functionalArea: "Y", severity: "MEDIUM" },
      { impactedRole: "B", functionalArea: "X", severity: "HIGH" },
      { impactedRole: "B", functionalArea: "Y", severity: "TRANSFORMATIONAL" },
    ];
    const result = generateHeatmapData(impacts);
    expect(result.length).toBe(4);

    const bY = result.find((c) => c.role === "B" && c.area === "Y");
    expect(bY!.severity).toBe("TRANSFORMATIONAL");
    expect(bY!.count).toBe(1);
  });

  it("returns role and area in each cell", () => {
    const impacts = [
      { impactedRole: "Developer", functionalArea: "IT", severity: "MEDIUM" },
    ];
    const result = generateHeatmapData(impacts);
    expect(result[0]!.role).toBe("Developer");
    expect(result[0]!.area).toBe("IT");
  });
});
