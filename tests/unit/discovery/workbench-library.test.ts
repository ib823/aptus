/**
 * ABeam Workbench — consultant library projection, facets, and APQC coverage.
 *
 * The C4 gap register is the important part here. It is DERIVED (D14), and these
 * tests are what stop it silently reverting to the stale "known 7".
 */

import { describe, expect, it } from "vitest";

import {
  COVERAGE_LEVEL_LABELS,
  apqcCoverage,
  derivedGapCategories,
  findLibraryRow,
  isGapLevel,
  libraryFacets,
  libraryRows,
  queryLibrary,
} from "@/lib/discovery/workbench/library";
import { allClientProcesses } from "@/lib/discovery/client-library";

describe("library rows", () => {
  it("projects all 742 processes", () => {
    expect(libraryRows()).toHaveLength(742);
  });

  it("carries completeness derived across the join (D2)", () => {
    // The consultant dataset has no top-level completeness column.
    const row = findLibraryRow("31G");
    expect(row?.completeness).toBe("detailed");
  });

  it("no row invents a completeness for a no-flow process", () => {
    const noFlow = libraryRows().filter((r) => !r.hasFlow);
    expect(noFlow).toHaveLength(197);
    expect(noFlow.every((r) => r.completeness === null)).toBe(true);
  });

  it("step counts agree with the client dataset's flow", () => {
    const client = new Map(allClientProcesses().map((p) => [p.id, p]));
    const bad = libraryRows().filter(
      (r) => r.mainSteps !== (client.get(r.scope_id)?.flow?.length ?? 0),
    );
    expect(bad).toEqual([]);
  });
});

describe("facets (C2)", () => {
  const f = libraryFacets();

  it("has every facet the brief asks for", () => {
    // §6B.1: stream/workflow/APQC/completeness/tier/industry/has-flow. The .dc
    // omits APQC and industry (conflict #4) — brief wins.
    expect(f.streams).toHaveLength(10);
    expect(f.workflows).toHaveLength(85);
    expect(f.apqc).toHaveLength(13);
    expect(f.tiers.map((t) => t.value).sort()).toEqual(["core", "generalized"]);
    expect(f.industries.length).toBe(5);
    expect(f.origins.map((o) => o.value).sort()).toEqual(["overlay", "sap-base"]);
  });

  it("has-flow counts are the honest 545 / 197", () => {
    expect(f.hasFlow).toEqual({ yes: 545, no: 197 });
  });

  it("facet counts sum to the whole library", () => {
    expect(f.streams.reduce((n, s) => n + s.count, 0)).toBe(742);
    expect(f.apqc.reduce((n, a) => n + a.count, 0)).toBe(742);
    expect(f.origins.reduce((n, o) => n + o.count, 0)).toBe(742);
  });

  it("origin split matches MANIFEST", () => {
    const byValue = Object.fromEntries(f.origins.map((o) => [o.value, o.count]));
    expect(byValue).toEqual({ "sap-base": 654, overlay: 88 });
  });
});

describe("query (C2)", () => {
  it("filters by facet", () => {
    expect(queryLibrary({ stream: "VS2" }).every((r) => r.streamId === "VS2")).toBe(true);
    expect(queryLibrary({ origin: "overlay" })).toHaveLength(88);
    expect(queryLibrary({ hasFlow: "no" })).toHaveLength(197);
  });

  it("combines facets", () => {
    const rows = queryLibrary({ origin: "overlay", hasFlow: "yes" });
    expect(rows.every((r) => r.origin === "overlay" && r.hasFlow)).toBe(true);
  });

  it("searches name, id and description", () => {
    expect(queryLibrary({ q: "31G" }).some((r) => r.scope_id === "31G")).toBe(true);
    expect(queryLibrary({ q: "chemical compliance" }).length).toBeGreaterThan(0);
  });

  it("sorts stably — equal keys keep a deterministic order", () => {
    const a = queryLibrary({ sort: "origin" }).map((r) => r.scope_id);
    const b = queryLibrary({ sort: "origin" }).map((r) => r.scope_id);
    expect(a).toEqual(b);
  });

  it("completeness sort surfaces the thinnest records first", () => {
    const rows = queryLibrary({ sort: "completeness" });
    expect(rows[0]?.completeness).toBeNull();
  });

  it("an unmatched query returns nothing rather than everything", () => {
    expect(queryLibrary({ q: "zzzznotathing" })).toHaveLength(0);
  });
});

describe("APQC coverage (C4)", () => {
  const cov = apqcCoverage();

  it("covers all 13 categories", () => {
    expect(cov).toHaveLength(13);
    expect(cov.map((c) => c.code)).toEqual([
      "1.0",
      "2.0",
      "3.0",
      "4.0",
      "5.0",
      "6.0",
      "7.0",
      "8.0",
      "9.0",
      "10.0",
      "11.0",
      "12.0",
      "13.0",
    ]);
  });

  it("totals sum to 742 and with-flow sums to 545", () => {
    expect(cov.reduce((n, c) => n + c.total, 0)).toBe(742);
    expect(cov.reduce((n, c) => n + c.withFlow, 0)).toBe(545);
  });

  it("labels all five brief levels (§6B.5) — Minimal and None are distinct", () => {
    // The .dc collapses Minimal and None into one grey fallback (conflict #13).
    expect(Object.keys(COVERAGE_LEVEL_LABELS).sort()).toEqual([
      "minimal",
      "none",
      "partial",
      "strong",
      "thin",
    ]);
  });

  it("level is derived from flow share, not process count", () => {
    // 9.0 has the most processes (253) but only 65% carry a flow — a big list is
    // not good coverage.
    const nine = cov.find((c) => c.code === "9.0")!;
    expect(nine.total).toBe(253);
    expect(nine.level).toBe("partial");
  });
});

/**
 * D14 — the stale-meta trap, pinned.
 *
 * `meta.apqc_coverage` still describes a 654-process snapshot and names seven
 * gap categories the 88-process overlay has since filled. If a future
 * re-emission fixes it, these tests fail and tell us — which is the point. They
 * are not asserting the staleness is GOOD; they are asserting we know about it
 * and do not read it.
 */
describe("D14 — the gap register is derived, never meta.gaps", () => {
  const META_GAPS = ["6.0", "5.0", "10.0", "7.0", "12.0", "8.0", "1.0"];

  it("every category meta calls a gap is in fact well covered", () => {
    const cov = new Map(apqcCoverage().map((c) => [c.code, c]));
    for (const code of META_GAPS) {
      const c = cov.get(code)!;
      expect(isGapLevel(c.level), `${code} (${c.category}) is ${c.level} — meta calls it a gap`).toBe(
        false,
      );
    }
  });

  it("the derived register finds the two categories meta misses", () => {
    const gaps = derivedGapCategories();
    expect(gaps.map((g) => g.code).sort()).toEqual(["11.0", "13.0"]);
    for (const g of gaps) expect(META_GAPS).not.toContain(g.code);
  });

  it("the register is ordered worst-first", () => {
    const gaps = derivedGapCategories();
    const shares = gaps.map((g) => g.flowShare);
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
  });

  it("no source file reads meta.apqc_coverage", async () => {
    const { readdirSync, readFileSync, statSync } = await import("fs");
    const { join } = await import("path");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(join(process.cwd(), "src"));

    const offenders = files
      .filter((f) => /apqc_coverage/.test(stripComments(readFileSync(f, "utf8"))))
      .map((f) => f.replace(process.cwd() + "/", ""));
    expect(
      offenders,
      `These read the stale meta.apqc_coverage block:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the comment-stripper works — the guard is not vacuous", () => {
    // Without stripping, this guard fires on library.ts's own doc comment
    // explaining why meta.apqc_coverage is NOT read. That is the third time a
    // guard of mine has matched prose instead of code (see D10, and PR-3's notes
    // guard). Strip first, then match — rather than reword the prose again.
    expect(stripComments('const x = meta.apqc_coverage;')).toContain("apqc_coverage");
    expect(stripComments('// never read meta.apqc_coverage')).not.toContain("apqc_coverage");
    expect(stripComments('/* meta.apqc_coverage is stale */')).not.toContain("apqc_coverage");
    expect(stripComments(' * D14 — `meta.apqc_coverage` is stale')).not.toContain("apqc_coverage");
  });
});

/**
 * A third independent check that the D6 re-emission was coherent: the consultant
 * dataset's provenance.completeness must agree with the client-join completeness
 * everywhere it exists. It did on inspection (742/742, zero disagreements) — this
 * keeps it true.
 */
describe("provenance agrees with the client join", () => {
  it("provenance.completeness never contradicts the joined completeness", () => {
    const rows = libraryRows();
    const bad = rows
      .filter((r) => r.provenance && "completeness" in (r.provenance as object))
      .filter(
        (r) => (r.provenance as { completeness?: string }).completeness !== r.completeness,
      )
      .map((r) => r.scope_id);
    expect(bad).toEqual([]);
  });

  it("provenance.main_steps never contradicts the real flow length", () => {
    const bad = rows_mismatch();
    expect(bad).toEqual([]);
  });
});

/**
 * Remove block comments, line comments, and JSDoc continuation lines, so a
 * source scan matches CODE rather than the prose that documents it.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*\*.*$/gm, "");
}

function rows_mismatch(): string[] {
  return libraryRows()
    .filter((r) => r.provenance)
    .filter((r) => (r.provenance as { main_steps?: number }).main_steps !== r.mainSteps)
    .map((r) => r.scope_id);
}
