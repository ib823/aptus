import { describe, it, expect } from "vitest";
import { calculateProfileCompleteness } from "@/lib/assessment/profile-completeness";

describe("calculateProfileCompleteness", () => {
  it("returns 0% for empty assessment", () => {
    const result = calculateProfileCompleteness({});
    expect(result.score).toBe(0);
    expect(result.breakdown.basic).toBe(false);
    expect(result.breakdown.financial).toBe(false);
    expect(result.breakdown.sapStrategy).toBe(false);
    expect(result.breakdown.operational).toBe(false);
    expect(result.breakdown.itLandscape).toBe(false);
  });

  it("returns ~30% when only basic fields are complete", () => {
    const result = calculateProfileCompleteness({
      companyName: "Acme Corp",
      industry: "Manufacturing",
      country: "MY",
      companySize: "large",
    });
    expect(result.score).toBe(30);
    expect(result.breakdown.basic).toBe(true);
    expect(result.breakdown.financial).toBe(false);
  });

  it("returns 100% when all fields are complete", () => {
    const result = calculateProfileCompleteness({
      companyName: "Acme Corp",
      industry: "Manufacturing",
      country: "MY",
      companySize: "large",
      employeeCount: 5000,
      annualRevenue: 100000000,
      deploymentModel: "public_cloud",
      sapModules: ["FI", "CO", "MM"],
      migrationApproach: "greenfield",
      targetGoLiveDate: new Date("2027-01-01"),
      keyProcesses: ["Order to Cash"],
      operatingCountries: ["MY", "SG"],
      currentErpVersion: "SAP ECC 6.0",
      itLandscapeSummary: "On-premise ECC with SAP PI for integrations",
    });
    expect(result.score).toBe(100);
    expect(result.breakdown.basic).toBe(true);
    expect(result.breakdown.financial).toBe(true);
    expect(result.breakdown.sapStrategy).toBe(true);
    expect(result.breakdown.operational).toBe(true);
    expect(result.breakdown.itLandscape).toBe(true);
  });

  it("treats empty arrays as incomplete", () => {
    const result = calculateProfileCompleteness({
      sapModules: [],
      keyProcesses: [],
      operatingCountries: [],
    });
    expect(result.breakdown.sapStrategy).toBe(false);
    expect(result.breakdown.operational).toBe(false);
  });

  it("gives partial credit within groups", () => {
    // Only companyName and industry of the 4 basic fields
    const result = calculateProfileCompleteness({
      companyName: "Test",
      industry: "IT",
    });
    // 2/4 of 30% = 15%
    expect(result.score).toBe(15);
  });

  it("treats null values as incomplete", () => {
    const result = calculateProfileCompleteness({
      companyName: null,
      industry: null,
    });
    expect(result.score).toBe(0);
  });

  it("treats empty strings as incomplete", () => {
    const result = calculateProfileCompleteness({
      companyName: "",
      industry: "  ",
    });
    expect(result.score).toBe(0);
  });

  it("correctly calculates score at the 60% gate threshold", () => {
    // basic (30%) + sapStrategy (30%) = 60%
    const result = calculateProfileCompleteness({
      companyName: "Acme Corp",
      industry: "Manufacturing",
      country: "MY",
      companySize: "large",
      deploymentModel: "public_cloud",
      sapModules: ["FI"],
      migrationApproach: "greenfield",
      targetGoLiveDate: new Date("2027-01-01"),
    });
    expect(result.score).toBe(60);
  });

  it("handles string date values", () => {
    const result = calculateProfileCompleteness({
      targetGoLiveDate: "2027-01-01T00:00:00.000Z",
    });
    // 1/4 of sapStrategy (30%) = 7.5 → rounded to 8
    expect(result.score).toBe(8);
  });
});
