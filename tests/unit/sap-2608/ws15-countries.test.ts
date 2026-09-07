/**
 * 2608 WS15 — the A&D country matrix.
 *
 * The defect these guard against is not a crash. It is a loader that reads 60
 * columns and stores 1, which produces a database that answers every question
 * confidently and wrongly about 59 countries. So the assertions are about the
 * rule that decides availability, and about the two spellings of it staying
 * equal.
 */
import { describe, expect, it } from "vitest";

import { availableCountries, isAvailableCell, nonEmptyCountryCells } from "../../../scripts/lib/sap-2608/parse";

describe("isAvailableCell — WS1.2's rule, applied to all 60 columns", () => {
  it("treats a release code as available", () => {
    // "2402" says WHEN, which is a stronger yes than a tick.
    expect(isAvailableCell("2402")).toBe(true);
    expect(isAvailableCell("1608")).toBe(true);
  });

  it('treats "No" and an empty cell as not available', () => {
    expect(isAvailableCell("No")).toBe(false);
    expect(isAvailableCell("")).toBe(false);
    expect(isAvailableCell("   ")).toBe(false);
  });

  it('treats a phrase such as "Can be added" as available', () => {
    // Not a default, but not a No either. WS1.2 read the MY column this way and
    // changing the rule for the other 59 would make availableInMy disagree with
    // countries — which a RECON fact forbids.
    expect(isAvailableCell("Can be added")).toBe(true);
  });
});

describe("availableCountries", () => {
  it("keeps only the available cells, sorted", () => {
    expect(
      availableCountries({ MY: "1702", PH: "1603", BR: "No", US: "", SG: "Can be added" }),
    ).toEqual(["MY", "PH", "SG"]);
  });

  it("returns an empty array when nothing is available, not a partial guess", () => {
    expect(availableCountries({ MY: "No", PH: "" })).toEqual([]);
  });

  it("agrees with isAvailableCell on every key it is given", () => {
    const cells = { MY: "1702", PH: "No", SG: "Can be added", US: "", BR: "2402" };
    const got = new Set(availableCountries(cells));
    for (const [c, v] of Object.entries(cells)) expect(got.has(c)).toBe(isAvailableCell(v));
  });
});

describe("nonEmptyCountryCells — the verbatim cell survives the boolean", () => {
  it('keeps "No" as well as a release code, because they say different things', () => {
    // The boolean list drops "No". This does not: knowing SAP explicitly says
    // No is different from knowing nothing about the country.
    expect(nonEmptyCountryCells({ MY: "1702", PH: "No", US: "" })).toEqual({ MY: "1702", PH: "No" });
  });

  it("trims, and drops only genuinely empty cells", () => {
    expect(nonEmptyCountryCells({ MY: "  2402  ", PH: "   ", SG: "" })).toEqual({ MY: "2402" });
  });
});

describe("the two spellings of Malaysia cannot disagree", () => {
  it("availableCountries includes MY exactly when isAvailableCell says so", () => {
    // This is the invariant a RECON fact checks against the live database
    // (`availableInMy vs countries has MY (must be 0)`); here it is pinned at
    // the level of the function that decides it.
    for (const v of ["1702", "2402", "No", "", "Can be added", "  "]) {
      expect(availableCountries({ MY: v }).includes("MY")).toBe(isAvailableCell(v));
    }
  });
});
