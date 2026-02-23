import { describe, it, expect } from "vitest";
import { computeComparisonDeltas } from "@/lib/assessment/gap-comparison";

describe("computeComparisonDeltas", () => {
  it("returns 5 comparison fields", () => {
    const deltas = computeComparisonDeltas({}, {});
    expect(deltas).toHaveLength(5);
    const fields = deltas.map((d) => d.field);
    expect(fields).toEqual([
      "One-Time Cost",
      "Recurring Cost",
      "Implementation Days",
      "Risk Level",
      "Upgrade Strategy",
    ]);
  });

  it("declares lower numeric value as winner", () => {
    const deltas = computeComparisonDeltas(
      { oneTimeCost: 10000, recurringCost: 2000, implementationDays: 20 },
      { oneTimeCost: 5000, recurringCost: 3000, implementationDays: 10 },
    );
    const otc = deltas.find((d) => d.field === "One-Time Cost")!;
    expect(otc.winner).toBe("alternative");
    expect(otc.delta).toBe(-5000);

    const rc = deltas.find((d) => d.field === "Recurring Cost")!;
    expect(rc.winner).toBe("primary");
    expect(rc.delta).toBe(1000);

    const id = deltas.find((d) => d.field === "Implementation Days")!;
    expect(id.winner).toBe("alternative");
    expect(id.delta).toBe(-10);
  });

  it("declares tie for equal values", () => {
    const deltas = computeComparisonDeltas(
      { oneTimeCost: 5000 },
      { oneTimeCost: 5000 },
    );
    const otc = deltas.find((d) => d.field === "One-Time Cost")!;
    expect(otc.winner).toBe("tie");
    expect(otc.delta).toBe(0);
  });

  it("handles null values in numeric fields", () => {
    const deltas = computeComparisonDeltas(
      { oneTimeCost: null },
      { oneTimeCost: 5000 },
    );
    const otc = deltas.find((d) => d.field === "One-Time Cost")!;
    expect(otc.winner).toBe("primary");
    expect(otc.delta).toBeNull();
  });

  it("compares risk levels ordinally (LOW < MEDIUM < HIGH)", () => {
    const deltas = computeComparisonDeltas(
      { riskLevel: "HIGH" },
      { riskLevel: "LOW" },
    );
    const risk = deltas.find((d) => d.field === "Risk Level")!;
    expect(risk.winner).toBe("alternative");
  });

  it("declares tie for equal risk levels", () => {
    const deltas = computeComparisonDeltas(
      { riskLevel: "MEDIUM" },
      { riskLevel: "MEDIUM" },
    );
    const risk = deltas.find((d) => d.field === "Risk Level")!;
    expect(risk.winner).toBe("tie");
  });

  it("compares upgrade strategies ordinally", () => {
    const deltas = computeComparisonDeltas(
      { upgradeStrategy: "custom_maintenance" },
      { upgradeStrategy: "standard_upgrade" },
    );
    const upgrade = deltas.find((d) => d.field === "Upgrade Strategy")!;
    expect(upgrade.winner).toBe("alternative");
  });

  it("handles missing (null) risk level and upgrade strategy", () => {
    const deltas = computeComparisonDeltas(
      { riskLevel: null, upgradeStrategy: null },
      { riskLevel: "LOW", upgradeStrategy: "standard_upgrade" },
    );
    const risk = deltas.find((d) => d.field === "Risk Level")!;
    expect(risk.winner).toBe("tie");

    const upgrade = deltas.find((d) => d.field === "Upgrade Strategy")!;
    expect(upgrade.winner).toBe("tie");
  });

  it("includes correct primary and alternative values", () => {
    const deltas = computeComparisonDeltas(
      { oneTimeCost: 10000, riskLevel: "HIGH", upgradeStrategy: "custom_maintenance" },
      { oneTimeCost: 5000, riskLevel: "LOW", upgradeStrategy: "standard_upgrade" },
    );
    const otc = deltas.find((d) => d.field === "One-Time Cost")!;
    expect(otc.primaryValue).toBe(10000);
    expect(otc.alternativeValue).toBe(5000);

    const risk = deltas.find((d) => d.field === "Risk Level")!;
    expect(risk.primaryValue).toBe("HIGH");
    expect(risk.alternativeValue).toBe("LOW");
  });
});
