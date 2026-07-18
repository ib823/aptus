/**
 * ABeam Workbench — THE WALL, both directions (invariant 2).
 *
 * PR-1's dependency-boundary test proved one direction: no (external) module
 * imports the consultant DATASET. PR-4 adds the consultant SURFACE — the fenced
 * product map (C6), its table, its API route — so the wall has to hold against
 * all of it.
 *
 * Brief §7-C6: "Must never be reachable from a client session."
 * Brief §12.6: "product-mapping and internal packs never appear on, or are
 * reachable from, any client surface."
 *
 * Three angles, because each catches something the others miss:
 *   1. Reachability — transitive import walk from every (external) entry.
 *   2. Content — the fence's vocabulary must not appear in client-facing source
 *      (this is what would catch someone re-typing "Oracle" into a /d component
 *      rather than importing it).
 *   3. Direction — the consultant side may import shared/client-safe modules;
 *      that is allowed and asserted, so the test does not over-fire.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const rel = (p: string) => relative(ROOT, p);

/** Everything on the consultant side of the wall. */
const FORBIDDEN_FROM_CLIENT = [
  "src/lib/discovery/consultant-library.ts",
  "src/lib/discovery/workbench/library.ts",
  "src/lib/discovery/workbench/product-map.ts",
  "src/data/discovery/discovery-library.consultant.json",
  "src/app/api/discovery/product-map/route.ts",
];

/** Whole directories that are consultant-only. */
const FORBIDDEN_DIRS = ["src/components/discovery/workbench/", "src/app/(workbench)/discovery/"];

const SOURCE_RE = /\.(ts|tsx)$/;
const IMPORT_RE = /(?:from\s*|import\s*\(?|require\s*\()\s*["']([^"']+)["']/g;

function walk(dir: string, out: string[], filter = SOURCE_RE): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out, filter);
    else if (filter.test(name)) out.push(p);
  }
}

function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.json`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function reachableFrom(entries: string[]): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue: Array<{ file: string; path: string[] }> = entries.map((f) => ({ file: f, path: [f] }));
  while (queue.length > 0) {
    const { file, path } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, path);
    if (!SOURCE_RE.test(file)) continue;
    for (const m of readFileSync(file, "utf8").matchAll(IMPORT_RE)) {
      const target = resolveImport(m[1]!, file);
      if (target && !seen.has(target)) queue.push({ file: target, path: [...path, target] });
    }
  }
  return seen;
}

function isForbidden(f: string): boolean {
  const r = rel(f);
  return FORBIDDEN_FROM_CLIENT.includes(r) || FORBIDDEN_DIRS.some((d) => r.startsWith(d));
}

// ─── 1 · client → consultant is unreachable ──────────────────────────────────

describe("the wall · client cannot reach the consultant side", () => {
  const entries: string[] = [];
  walk(join(SRC, "app/(external)"), entries);

  it("scans a non-empty set of (external) entry points", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("every consultant-only module we guard actually exists", () => {
    // A guard listing a path that has moved is a guard that silently passes.
    for (const f of FORBIDDEN_FROM_CLIENT) {
      expect(existsSync(join(ROOT, f)), `${f} is guarded but missing`).toBe(true);
    }
    for (const d of FORBIDDEN_DIRS) {
      expect(existsSync(join(ROOT, d)), `${d} is guarded but missing`).toBe(true);
    }
  });

  it("no (external) module reaches the consultant library, the product map, or its route", () => {
    const reached = reachableFrom(entries);
    const offenders: string[] = [];
    for (const [file, path] of reached) {
      if (isForbidden(file)) {
        offenders.push(`FORBIDDEN ${rel(file)}\n    via: ${path.map(rel).join("\n       → ")}`);
      }
    }
    expect(
      offenders,
      `The consultant side is reachable from a client surface (invariant 2):\n${offenders.join("\n\n")}`,
    ).toEqual([]);
  });

  it("the walk is transitive, not shallow (proof the guard has teeth)", () => {
    // C6's page reaches the consultant dataset several hops down. If this stops
    // being true, the walk has stopped following imports and the test above is
    // passing vacuously.
    const reached = reachableFrom([join(SRC, "app/(workbench)/discovery/map/page.tsx")]);
    expect([...reached.keys()].map(rel)).toContain(
      "src/data/discovery/discovery-library.consultant.json",
    );
  });
});

// ─── 2 · the fence's vocabulary is absent from client source ─────────────────

describe("the wall · no fence vocabulary in client-facing source", () => {
  /**
   * The import walk catches a client module IMPORTING the fence. It cannot catch
   * someone re-typing the fence's content into a /d component by hand — which is
   * the likelier mistake, and the one that puts a vendor name on a client
   * screen. Comments are stripped first: the offence is the rendered string, and
   * a /d file may legitimately explain in prose why it never names a product.
   */
  const FENCE_STRINGS = [
    "Consultant only",
    "never shared with the client",
    "product map",
    "Rosetta",
    "to map",
    "DiscoveryProductMap",
    "productCoverage",
  ];

  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/^\s*\*.*$/gm, "");
  }

  const files: string[] = [];
  walk(join(SRC, "app/(external)/d"), files);
  walk(join(SRC, "components/discovery"), files);
  // components/discovery/workbench IS the consultant side — exclude it.
  const clientFiles = files.filter((f) => !rel(f).startsWith("src/components/discovery/workbench/"));

  it("scans a non-empty set of client files", () => {
    expect(clientFiles.length).toBeGreaterThan(0);
  });

  it("the stripper keeps code and drops prose", () => {
    expect(stripComments('const x = "Rosetta";')).toContain("Rosetta");
    expect(stripComments("// the Rosetta lives in the workbench")).not.toContain("Rosetta");
  });

  it("no client-facing file contains fence vocabulary", () => {
    const offenders: string[] = [];
    for (const f of clientFiles) {
      const code = stripComments(readFileSync(f, "utf8"));
      for (const s of FENCE_STRINGS) {
        if (code.includes(s)) offenders.push(`${rel(f)} → "${s}"`);
      }
    }
    expect(
      offenders,
      `Fence vocabulary found on the client surface:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

// ─── 3 · the consultant side may reach client-safe modules ──────────────────

describe("the wall is one-way, not a moat", () => {
  it("the consultant surface CAN import client-safe modules", () => {
    // The wall stops client→consultant. The reverse is fine and expected: C2
    // derives completeness from the client dataset (D2). If this ever failed,
    // someone had over-tightened the wall into a duplication generator.
    const reached = reachableFrom([join(SRC, "lib/discovery/workbench/library.ts")]);
    expect([...reached.keys()].map(rel)).toContain("src/data/discovery/discovery-library.client.json");
  });
});
