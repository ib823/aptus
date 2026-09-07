// @vitest-environment node
/**
 * 2608 WS9 — every scope item an SSCUI applies to, not only the first.
 *
 * The parser is checked against the real 2608 SSCUI workbook rather than a
 * fixture: the defect being fixed was that a real multi-value cell collapsed
 * to one id, and a fixture would let the parser drift back without noticing.
 */
import { describe, expect, it } from "vitest";

import { sapContentSourcesFor } from "../../../scripts/lib/sap-content-sources";
import { firstScopeItemId, parseSscuiList, scopeItemIdsFrom } from "../../../scripts/lib/sap-2608/parse";

describe("scopeItemIdsFrom", () => {
  it("splits a list on commas and semicolons and trims", () => {
    expect(scopeItemIdsFrom("J14, J13; 22Z")).toEqual(["J14", "J13", "22Z"]);
    expect(scopeItemIdsFrom("  J58  ")).toEqual(["J58"]);
  });

  it('keeps "All" as a single element rather than expanding it', () => {
    // Expanding would assert a per-scope-item claim the source never made.
    expect(scopeItemIdsFrom("All")).toEqual(["All"]);
  });

  it("treats an empty cell the same way firstScopeItemId does", () => {
    expect(scopeItemIdsFrom("")).toEqual(["All"]);
    expect(firstScopeItemId("")).toBe("All");
  });

  it("de-duplicates while keeping file order", () => {
    expect(scopeItemIdsFrom("J58, J14, J58")).toEqual(["J58", "J14"]);
  });

  it("always starts with what the pre-WS9 column stored", () => {
    for (const raw of ["J14, J13, 22Z", "All", "J58", "  1GP ; J58 "]) {
      expect(scopeItemIdsFrom(raw)[0]).toBe(firstScopeItemId(raw));
    }
  });
});

describe("the 2608 SSCUI list", () => {
  it("carries far more scope-item links than rows, which is the whole point", async () => {
    const rows = await parseSscuiList(sapContentSourcesFor("2608"));
    expect(rows.length).toBe(4328);
    const links = rows.reduce((n, r) => n + r.mainScopeItemCodes.length, 0);
    // 813,804 at the 2608 harvest. What matters is that it is nowhere near the
    // row count — one link per row was the bug.
    expect(links).toBeGreaterThan(700_000);
    expect(rows.filter((r) => r.mainScopeItemCodes.length > 1).length).toBeGreaterThan(3_000);
  }, 60_000);

  it("reaches J58 from far more than the single activity that used to be visible", async () => {
    const rows = await parseSscuiList(sapContentSourcesFor("2608"));
    expect(rows.filter((r) => r.scopeItemId === "J58").length).toBe(1); // all a pre-WS9 consumer could see
    expect(rows.filter((r) => r.mainScopeItemCodes.includes("J58")).length).toBeGreaterThan(1_000);
  }, 60_000);

  it("never loses the id the old column stored", async () => {
    const rows = await parseSscuiList(sapContentSourcesFor("2608"));
    for (const r of rows) expect(r.mainScopeItemCodes).toContain(r.scopeItemId);
  }, 60_000);
});
