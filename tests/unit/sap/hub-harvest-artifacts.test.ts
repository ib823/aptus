/**
 * The harvest keeps what it fetches, and keeps it apart from curated content.
 *
 * WHAT WAS WRONG. The Hub walk fetched 32,084 artifacts across 23 types and
 * stored 4,597 — it discarded 85% of what one run had already downloaded, on
 * a single line (`if (a.Type !== "API") continue`). The type counts were even
 * recorded in provenance while the rows were dropped, so the catalogue's own
 * file said what it was throwing away and nothing read it.
 *
 * TWO THINGS THIS FILE PINS, both found by getting them wrong first:
 *
 *   1. The harvest writes to sap-references/hub-harvest/, NOT into the curated
 *      hub-content/ drop targets. Writing into those destroyed 158 grouped
 *      integrations, 77 builds and 19 CDS groupings, because curated rows key
 *      on GROUP identifiers ("S4HANACloudBADI" standing for a thousand BAdIs)
 *      and the harvest keys on individual artifacts. Both vocabularies are
 *      legitimate; neither may erase the other.
 *
 *   2. Nothing in hub-harvest/ is statically imported. hub-content-bundled.ts
 *      bakes its imports into every serverless function, and INTEGRATION.json
 *      alone is 2.4MB.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const HARVEST = resolve(ROOT, "sap-references/hub-harvest");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("the harvested artifacts are in the repository", () => {
  it("every file is git-tracked, not merely present on this disk", () => {
    /*
     * `/sap-references/*` is gitignored and this directory needed an explicit
     * negation. Every other assertion here reads from disk and would pass
     * locally while CI, cloning a repository without the files, fails on a
     * missing path. That defect has now shipped once (product glyphs) and been
     * caught twice (artifact counts, and this) by exactly this check.
     */
    const onDisk = readdirSync(HARVEST).filter((f) => f.endsWith(".json")).sort();
    const tracked = execFileSync("git", ["ls-files", "sap-references/hub-harvest/"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .map((p) => p.split("/").pop()!)
      .sort();

    expect(onDisk.length).toBeGreaterThan(0);
    expect(tracked).toEqual(onDisk);
  });
});

describe("the harvest carries what it used to discard", () => {
  const counts = Object.fromEntries(
    readdirSync(HARVEST)
      .filter((f) => f.endsWith(".json"))
      .map((f) => [f.replace(".json", ""), (JSON.parse(read(`sap-references/hub-harvest/${f}`)) as unknown[]).length]),
  );

  it("holds thousands of rows across several content types", () => {
    // Floors, not exact counts — the Hub grows between harvests.
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(5);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total, "total harvested artifacts").toBeGreaterThan(6000);
  });

  it("integrations dominate, as the Hub's own type counts predict", () => {
    expect(counts.INTEGRATION, "IFlow is the largest mappable type").toBeGreaterThan(3000);
  });

  it("every row is marked NOT illustrative — this is SAP content", () => {
    // The illustrative flag exists so repo-authored placeholders are
    // distinguishable. Harvested rows are the opposite of that, and the
    // demotion guard depends on them saying so.
    for (const f of readdirSync(HARVEST).filter((n) => n.endsWith(".json"))) {
      const rows = JSON.parse(read(`sap-references/hub-harvest/${f}`)) as { illustrative?: boolean }[];
      expect(rows.every((r) => r.illustrative === false), `${f} must not claim to be illustrative`).toBe(true);
    }
  });

  it("every row has the externalId the importer requires", () => {
    for (const f of readdirSync(HARVEST).filter((n) => n.endsWith(".json"))) {
      const rows = JSON.parse(read(`sap-references/hub-harvest/${f}`)) as { externalId?: string }[];
      expect(rows.every((r) => typeof r.externalId === "string" && r.externalId.length > 0), f).toBe(true);
    }
  });
});

describe("curated content is protected from the harvest", () => {
  it("the harvest writes to hub-harvest, never into hub-content", () => {
    const src = read("scripts/harvest-sap-api-hub.ts");
    expect(src).toMatch(/"hub-harvest"/);
    // The exact mistake that destroyed curated rows.
    expect(src).not.toMatch(/dirname\(OUT\),\s*"hub-content"/);
  });

  it("nothing in hub-harvest is statically imported into the bundle", () => {
    /*
     * A static import IS the bundling instruction. hub-content-bundled.ts
     * exists so the admin Rebuild works without a DB secret leaving Vercel,
     * and it already excludes high-volume types on purpose. 2.4MB of
     * integrations must never reach a serverless function.
     */
    const bundled = read("src/lib/sap-public/hub-content-bundled.ts");
    expect(bundled).not.toMatch(/hub-harvest/);
  });

  it("the importer reads both directories", () => {
    const src = read("scripts/import-sap-hub-content.ts");
    expect(src).toMatch(/\[PER_TYPE_DIR,\s*HARVEST_DIR\]/);
  });
});

describe("the harvest still says what it cannot carry", () => {
  it("names the artifact types it has no content type for", () => {
    const { _provenance } = JSON.parse(read("sap-references/api-hub-catalog.json")) as {
      _provenance: { unmappedArtifactTypes?: Record<string, number>; completeness: string };
    };
    // Silence about unsupported types is how "we don't carry Data Products"
    // becomes a thing nobody knows. It must be stated.
    expect(_provenance.unmappedArtifactTypes).toBeDefined();
    expect(Object.keys(_provenance.unmappedArtifactTypes!).length).toBeGreaterThan(5);
    expect(_provenance.completeness).toBe("floor");
  });
});
