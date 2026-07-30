/**
 * Edition tagging, and the two dialects SAP writes product names in.
 *
 * WHAT WENT WRONG. The harvested Hub catalogue tagged 4,568 of 4,597 APIs as
 * belonging to NO edition. Not an error, not a warning — a number that reads
 * exactly like "SAP publishes nothing for private or on-premise", which is the
 * conclusion an earlier specification in this repository actually reached.
 *
 * Two causes, both in the shape of the string rather than the logic:
 *
 *   1. THE COMMA MEANS TWO DIFFERENT THINGS. A downloaded export writes
 *      "SAP S/4HANA Cloud, private edition" — a qualifier. The Hub's OData
 *      writes "SAPS4HANA,SAPS4HANACloudPrivateEdition" — two products. The
 *      splitter refused to split on commas at all, so the second form stayed
 *      one unrecognisable tag. 547 APIs carry exactly it.
 *
 *   2. THE HUB STRIPS SPACES. Matching only "s/4hana cloud" misses
 *      "SAPS4HANACloud" — same product, no spaces, no slash.
 *
 * Both dialects are real and both are tested here, because fixing one by
 * breaking the other would move the silence rather than end it.
 */

import { describe, expect, it } from "vitest";

import { mapEditionFromProductTags } from "../../../scripts/import-sap-api-catalog";

const tag = (t: string) => mapEditionFromProductTags([t]);

describe("the Hub's compact dialect", () => {
  it("reads SAPS4HANACloud as public", () => {
    expect(tag("SAPS4HANACloud")).toEqual({
      appliesToPublic: true,
      appliesToPrivate: false,
      appliesToOnPrem: false,
    });
  });

  it("reads SAPS4HANA — no 'Cloud' — as on-premise", () => {
    expect(tag("SAPS4HANA")).toEqual({
      appliesToPublic: false,
      appliesToPrivate: false,
      appliesToOnPrem: true,
    });
  });

  it("splits the comma-joined pair into BOTH products", () => {
    /*
     * The single most common S/4 tag in the harvest, on 547 APIs. It names two
     * products: S/4HANA (on-premise) and S/4HANA Cloud Private Edition. Read as
     * one string it matched nothing at all.
     */
    expect(tag("SAPS4HANA,SAPS4HANACloudPrivateEdition")).toEqual({
      appliesToPublic: false,
      appliesToPrivate: true,
      appliesToOnPrem: true,
    });
  });

  it("does not let compact 'S4HANACloud' fall through to on-premise", () => {
    // The on-prem rule is "s/4hana and NOT cloud". Testing that on the spaced
    // form while the tag is compact would have made every cloud API on-prem.
    expect(tag("SAPS4HANACloudPrivateEdition").appliesToOnPrem).toBe(false);
  });
});

describe("the human dialect still works", () => {
  /*
   * The downloaded-export path predates this and is still supported. A fix that
   * only served the Hub would have broken the route the documentation tells
   * people to use.
   */
  it("treats ', private edition' as a qualifier, not a second product", () => {
    expect(tag("SAP S/4HANA Cloud, private edition")).toEqual({
      appliesToPublic: false,
      appliesToPrivate: true,
      appliesToOnPrem: false,
    });
  });

  it("reads bare 'SAP S/4HANA Cloud' as public", () => {
    expect(tag("SAP S/4HANA Cloud").appliesToPublic).toBe(true);
  });

  it("reads bare 'SAP S/4HANA' as on-premise", () => {
    expect(tag("SAP S/4HANA").appliesToOnPrem).toBe(true);
  });

  it("still honours the semicolon and pipe separators", () => {
    const both = mapEditionFromProductTags(["SAP S/4HANA Cloud; SAP S/4HANA"]);
    expect(both.appliesToPublic).toBe(true);
    expect(both.appliesToOnPrem).toBe(true);
  });

  it("reads RISE as private", () => {
    expect(tag("RISE with SAP").appliesToPrivate).toBe(true);
  });
});

describe("products that are not S/4 editions carry no edition", () => {
  /*
   * AND THAT IS CORRECT, NOT A GAP. Ariba and SuccessFactors are not editions
   * of S/4HANA — there is no public/private/on-prem axis for them. 235 Ariba
   * and 86 SuccessFactors APIs in the harvest sit here.
   *
   * The consequence is worth stating plainly: getDynamicOdataServices filters
   * BY EDITION, so it cannot retrieve them. Reaching those rows needs a
   * by-product path, which does not exist yet. Tagging them "public" to make
   * them appear would be a lie in the one field that decides which landscape a
   * service belongs to.
   */
  it.each(["SAPAriba", "SAP Ariba", "SAPSuccessFactors", "SAPFieldglass"])(
    "%s has no edition",
    (t) => {
      expect(tag(t)).toEqual({
        appliesToPublic: false,
        appliesToPrivate: false,
        appliesToOnPrem: false,
      });
    },
  );
});

describe("the harvested catalogue actually classifies", () => {
  it("tags a real, substantial share of the committed harvest", async () => {
    /*
     * The regression guard. A future edit that reverts either dialect fix
     * cannot be caught by unit strings alone — the 4,568-untagged result came
     * from code whose own unit examples all passed. So this reads the committed
     * file and asserts the outcome on real SAP data.
     */
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const file = resolve(__dirname, "../../../sap-references/api-hub-catalog.json");
    const { apis } = JSON.parse(readFileSync(file, "utf8")) as {
      apis: { product: string | null }[];
    };

    let publicN = 0;
    let privateN = 0;
    let onPremN = 0;
    for (const a of apis) {
      const e = mapEditionFromProductTags([String(a.product ?? "")]);
      if (e.appliesToPublic) publicN++;
      if (e.appliesToPrivate) privateN++;
      if (e.appliesToOnPrem) onPremN++;
    }

    expect(apis.length).toBeGreaterThan(4000);
    // Was 2 / 0 / 27 before the fix. These are floors, not exact counts — the
    // catalogue is expected to grow when it is re-harvested.
    expect(publicN, "public").toBeGreaterThan(400);
    expect(privateN, "private").toBeGreaterThan(400);
    expect(onPremN, "on-premise").toBeGreaterThan(400);
  });
});

describe("the harvest states what it cannot know", () => {
  it("records provenance and calls itself a floor", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const file = resolve(__dirname, "../../../sap-references/api-hub-catalog.json");
    const { _provenance } = JSON.parse(readFileSync(file, "utf8")) as {
      _provenance: Record<string, unknown>;
    };

    // "Is the catalogue current?" previously had no answer from inside the
    // product. These four fields are that answer.
    expect(_provenance.source).toContain("api.sap.com");
    expect(_provenance.harvestedAt).toBeTruthy();
    expect(_provenance.packagesRead).toBeGreaterThan(1000);

    /*
     * A FLOOR, NOT A CENSUS. The walk finds APIs that belong to a package; the
     * entity set that would say how many exist in total is behind the OAuth
     * wall. The size of that gap cannot be measured from here, so it is named
     * rather than assumed away.
     */
    expect(_provenance.completeness).toBe("floor");
    expect(String(_provenance.note)).toMatch(/NOT evidence/i);
  });
});
