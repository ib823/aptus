/**
 * Reaching the rows that belong to no edition.
 *
 * THE GAP. getDynamicOdataServices filters on appliesToPublic/Private/OnPrem.
 * Ariba and SuccessFactors are not editions of S/4HANA, so they carry no
 * edition flag — correctly, and the edition-tagging tests assert exactly that.
 * The consequence was that 321 harvested rows could be reached by no query at
 * all. `SapApiReference.productTags` (added 2026-07-30) stores SAP's tag
 * string verbatim; this is the filter that uses it.
 *
 * The dialect truth table below is the point. SAP writes these product names
 * two ways depending on the source, and a filter that handles one silently
 * returns zero rows for the other — which reads exactly like "SAP publishes
 * nothing here", the same misreading that cost the catalogue its private and
 * on-premise rows for months.
 */

import { describe, expect, it } from "vitest";

import { productTagFilter } from "@/lib/sap-public/dynamic-catalog";

/** Does this filter's substring match this tag, as Postgres `contains` insensitive would? */
function matches(product: "ariba" | "successfactors", tag: string): boolean {
  return tag.toLowerCase().includes(productTagFilter(product).productTags.contains);
}

describe("productTagFilter matches both dialects SAP writes", () => {
  const ARIBA_TAGS = ["SAPAriba", "SAP Ariba", "SAPARIBA", "SAP Ariba Buying"];
  const SF_TAGS = [
    "SAPSuccessFactors",
    "SAP SuccessFactors",
    "SAPSuccessFactorsEmployeeCentral",
    "SAP SuccessFactors HXM Suite",
  ];

  it.each(ARIBA_TAGS)("ariba filter matches %s", (tag) => {
    expect(matches("ariba", tag)).toBe(true);
  });

  it.each(SF_TAGS)("successfactors filter matches %s", (tag) => {
    expect(matches("successfactors", tag)).toBe(true);
  });

  it("neither filter matches any S/4 tag — no cross-contamination", () => {
    const s4Tags = [
      "SAPS4HANA",
      "SAPS4HANACloud",
      "SAP S/4HANA Cloud, private edition",
      "SAPS4HANA,SAPS4HANACloudPrivateEdition",
      "SAP S/4HANA Cloud Public Edition",
    ];
    for (const tag of s4Tags) {
      expect(matches("ariba", tag), tag).toBe(false);
      expect(matches("successfactors", tag), tag).toBe(false);
    }
  });

  it("the two products do not match each other", () => {
    expect(matches("ariba", "SAPSuccessFactors")).toBe(false);
    expect(matches("successfactors", "SAPAriba")).toBe(false);
  });
});

describe("the committed harvest is actually reachable by these filters", () => {
  it("finds real Ariba and SuccessFactors rows in the harvested catalogue", async () => {
    /*
     * Against the real file, not unit strings. A filter that passes the truth
     * table above but returns nothing on the actual harvest would be exactly
     * the failure this is meant to end — the previous edition-tagging bug had
     * passing unit examples too.
     */
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const file = resolve(__dirname, "../../../sap-references/api-hub-catalog.json");
    const { apis } = JSON.parse(readFileSync(file, "utf8")) as {
      apis: { product: string | null }[];
    };

    const ariba = apis.filter((a) => matches("ariba", String(a.product ?? ""))).length;
    const sf = apis.filter((a) => matches("successfactors", String(a.product ?? ""))).length;

    // Floors, not exact counts — the catalogue is expected to grow.
    expect(ariba, "ariba rows reachable").toBeGreaterThan(100);
    expect(sf, "successfactors rows reachable").toBeGreaterThan(50);
  });
});
