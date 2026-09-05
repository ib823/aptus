/**
 * 2608 WS1 — the A&D parser and the scope-item plan.
 *
 * The parser runs against the real landed workbook (1.1 MB, fast) and must
 * reproduce the prompt's facts; the planner is exercised on a synthetic A&D
 * so every lifecycle branch is pinned without a 5 MB Process-Steps parse.
 */

import { describe, expect, it } from "vitest";

import { sapContentSourcesFor } from "../../../scripts/lib/sap-content-sources";
import { parseAvailabilityDependencies, type AdParse, type AdScopeItem } from "../../../scripts/lib/sap-2608/parse";
import { loadLifecycleFile, planScopeItems } from "../../../scripts/load-2608-scope";

const SOURCES = sapContentSourcesFor("2608");

describe("parseAvailabilityDependencies (real 2608 file)", () => {
  it("yields 679 distinct scope items from 942 rows, 623 available in MY, 143 retired", async () => {
    const ad = await parseAvailabilityDependencies(SOURCES);
    expect(ad.items.size).toBe(679);
    expect(ad.rowCount).toBe(942);
    expect([...ad.items.values()].filter((i) => i.availableInMy)).toHaveLength(623);
    expect(ad.retired).toHaveLength(143);
    expect(ad.retired[0]).toEqual({ code: "19C", name: "Activity Management in Procurement" });
  });

  it("merges an item's several LOB/business-area rows into one record", async () => {
    const ad = await parseAvailabilityDependencies(SOURCES);
    const item = ad.items.get("6GD")!;
    expect(item.lobs.length).toBeGreaterThan(1);
    expect(item.businessAreas.length).toBeGreaterThan(item.lobs.length - 1);
    expect(item.myValue).toBe("2402");
    expect(item.myAvailableSince).toBe("2402");
    expect(item.requiredScopeCodes).toContain("J59");
  }, 20_000);
});

function item(code: string, over: Partial<AdScopeItem> = {}): AdScopeItem {
  return {
    code,
    name: `Item ${code}`,
    lobs: ["Sales"],
    businessAreas: ["Order and Contract Management"],
    cluster: "1",
    component: "SD-SLS",
    licenseRequired: "",
    provisioning: "Default",
    selectableInScoping: "Yes",
    requiredScopeCodes: [],
    requiredMasterData: "",
    countries: { MY: "2402" },
    myValue: "2402",
    availableInMy: true,
    myAvailableSince: "2402",
    ...over,
  };
}

describe("planScopeItems", () => {
  const ad: AdParse = {
    items: new Map([item("BD9"), item("1RK"), item("1NN")].map((i) => [i.code, i])),
    retired: [
      { code: "1QR", name: "Predictive Analytics for Purchase Contract Quantity Consumption" },
      { code: "19C", name: "Activity Management in Procurement" },
    ],
    rowCount: 3,
  };
  const steps = new Map([
    ["BD9", { total: 124, my: 100 }],
    ["1NN", { total: 4, my: 4 }],
    ["ZZZ", { total: 2, my: 1 }],
  ]);
  const lifecycle = loadLifecycleFile(SOURCES.dropDir!);

  it("assigns every lifecycle status from the files + the checked-in list", () => {
    const { rows, findings } = planScopeItems(ad, steps, lifecycle);
    const map = new Map(rows.map((r) => [r.scopeCode, r]));
    const by = (code: string) => {
      const r = map.get(code);
      if (!r) throw new Error(`no planned row for ${code}`);
      return r;
    };
    expect(by("BD9").lifecycleStatus).toBe("ACTIVE");
    expect(by("BD9").totalSteps).toBe(100); // MY rows, not all rows
    expect(by("1RK").lifecycleStatus).toBe("DEPRECATION_PLANNED");
    expect(by("1RK").successorScopeCodes).toEqual(["7MI"]);
    expect(by("1QR").lifecycleStatus).toBe("OBSOLETE");
    expect(by("19C").lifecycleStatus).toBe("RETIRED");
    expect(by("19C").totalSteps).toBe(0);
    expect(by("ZZZ").lifecycleStatus).toBe("ANOMALY");
    expect(by("ZZZ").totalSteps).toBe(1);
    // 1NN is in A&D here, so it is NOT an anomaly — the loader decides from files.
    expect(by("1NN").lifecycleStatus).toBe("ACTIVE");
    // The synthetic A&D lacks the other deprecation/obsolete codes → reported, never invented.
    expect(findings.some((f) => f.includes("deprecation-planned code"))).toBe(true);
    expect(findings.some((f) => f.includes("obsolete code"))).toBe(true);
  });

  it("never invents a successor", () => {
    const { rows } = planScopeItems(ad, steps, lifecycle);
    for (const r of rows)
      if (r.lifecycleStatus === "ACTIVE" || r.lifecycleStatus === "RETIRED") expect(r.successorScopeCodes).toEqual([]);
  });
});
