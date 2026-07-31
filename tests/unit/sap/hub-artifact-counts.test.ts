/**
 * CDS views and BAdIs — measured per edition, instead of asserted.
 *
 * WHAT WAS WRONG. The catalogue carried grouped seed rows claiming 4,513 CDS
 * views and 1,665 BAdIs. Those were illustrative placeholders (now flagged as
 * such by `SapHubContent.illustrative`), and nothing in the repository could
 * say what the real per-edition numbers were. A Hub-wide artifact tally showed
 * 12,100 and 1,000 — a different scope again, since it spans every product.
 * Two numbers, neither measured against the question anyone was asking.
 *
 * `sap-references/hub-artifact-counts.json` is that measurement: counts per
 * package product tag, harvested the same anonymous way as the API catalogue.
 * Counts and not rows on purpose — ~13,000 CDS/BAdI records would dominate the
 * repository for content nothing probes.
 *
 * The edition split here is computed with the REAL `mapEditionFromProductTags`,
 * not a local re-implementation, so a regression in the tag dialects (the
 * defect that once left 4,568 of 4,597 APIs untagged) fails this file too.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { mapEditionFromProductTags } from "../../../scripts/import-sap-api-catalog";

interface CountsFile {
  _provenance: {
    source: string;
    harvestedAt: string;
    packagesRead: number;
    completeness: string;
    note: string;
    hubWideTotals: { CDS_VIEW: number; BADI: number };
  };
  byProductTag: Record<string, { CDS_VIEW?: number; BADI?: number }>;
}

const counts = JSON.parse(
  readFileSync(resolve(__dirname, "../../../sap-references/hub-artifact-counts.json"), "utf8"),
) as CountsFile;

/** Sum one artifact type across every tag that classifies to an edition. */
function perEdition(type: "CDS_VIEW" | "BADI") {
  const totals = { public: 0, private: 0, onPrem: 0 };
  for (const [tag, types] of Object.entries(counts.byProductTag)) {
    const n = types[type];
    if (!n) continue;
    const e = mapEditionFromProductTags([tag]);
    if (e.appliesToPublic) totals.public += n;
    if (e.appliesToPrivate) totals.private += n;
    if (e.appliesToOnPrem) totals.onPrem += n;
  }
  return totals;
}

describe("the counts file is actually in the repository", () => {
  it("is git-tracked, not merely present on this disk", async () => {
    /*
     * READS OF THE FILE ABOVE WOULD PASS EITHER WAY. `/sap-references/*` is
     * gitignored, and this file needed an explicit negation to escape it —
     * without which every test here would go green locally while CI, cloning
     * a repository that does not contain the file, fails on a missing path.
     * That exact defect already shipped once with the product glyphs, where
     * `git ls-files` was the check that caught it and `existsSync` was not.
     */
    const { execFileSync } = await import("node:child_process");
    const tracked = execFileSync("git", ["ls-files", "sap-references/hub-artifact-counts.json"], {
      cwd: resolve(__dirname, "../../.."),
      encoding: "utf8",
    }).trim();
    expect(tracked).toBe("sap-references/hub-artifact-counts.json");
  });
});

describe("the counts file states what it is", () => {
  it("records provenance and calls itself a floor", () => {
    expect(counts._provenance.source).toContain("api.sap.com");
    expect(counts._provenance.harvestedAt).toBeTruthy();
    expect(counts._provenance.packagesRead).toBeGreaterThan(1000);
    // Same honesty vocabulary as the API harvest: this counts artifacts that
    // belong to a package, and cannot see what is behind the OAuth wall.
    expect(counts._provenance.completeness).toBe("floor");
    expect(counts._provenance.note).toMatch(/NOT evidence/i);
  });

  it("does not claim tenant availability anywhere", () => {
    // A count is what SAP publishes. Whether a tenant has any of it activated
    // is a probe result, and no probe has run against these.
    expect(JSON.stringify(counts)).not.toMatch(/activated/i);
  });
});

describe("CDS views and BAdIs classify to real editions", () => {
  it("both public and private carry thousands of CDS views", () => {
    const cds = perEdition("CDS_VIEW");
    // Floors, not exact counts — the Hub grows. The point is that neither is
    // zero and neither is the fabricated 4,513.
    expect(cds.public, "public CDS views").toBeGreaterThan(4000);
    expect(cds.private, "private CDS views").toBeGreaterThan(4000);
  });

  it("BAdIs are published for both editions too", () => {
    const badi = perEdition("BADI");
    expect(badi.public, "public BAdIs").toBeGreaterThan(100);
    expect(badi.private, "private BAdIs").toBeGreaterThan(100);
  });

  it("the per-edition sums never exceed the Hub-wide totals", () => {
    // A guard against double counting a multi-product tag into the same
    // edition twice: any edition's share must fit inside the whole.
    const cds = perEdition("CDS_VIEW");
    const { CDS_VIEW: hubCds } = counts._provenance.hubWideTotals;
    expect(cds.public).toBeLessThanOrEqual(hubCds);
    expect(cds.private).toBeLessThanOrEqual(hubCds);
    expect(cds.onPrem).toBeLessThanOrEqual(hubCds);
  });

  it("every counted tag classifies to at least one edition", () => {
    // An unclassified tag here would be the 4,568-untagged defect returning in
    // a different file — silence that reads like "SAP publishes nothing".
    const unclassified = Object.keys(counts.byProductTag).filter((tag) => {
      const e = mapEditionFromProductTags([tag]);
      return !e.appliesToPublic && !e.appliesToPrivate && !e.appliesToOnPrem;
    });
    expect(unclassified).toEqual([]);
  });
});
