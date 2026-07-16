/**
 * ABeam Workbench — Neutral Process Discovery dependency boundary (INVARIANT 2).
 *
 * The consultant dataset carries origin, provenance and the 18 parked vendor
 * enablers. It must be unreachable from the client surface — not "we agreed not
 * to import it", but provably unimported.
 *
 * This walks the TRANSITIVE import graph from every (external) entry point. A
 * direct-import grep would miss the realistic failure: someone adds a shared
 * helper that imports the consultant loader, and a client route imports the
 * helper. The leak is two hops away and a grep never sees it.
 *
 * The wall is enforced in three independent places, by design:
 *   - this test (reachability),
 *   - the serializer allowlist (no mapper accepts a ConsultantProcess),
 *   - the vendor-term grep (hardcoded copy).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Modules the client surface may never reach, transitively. */
const FORBIDDEN = [
  "src/lib/discovery/consultant-library.ts",
  "src/data/discovery/discovery-library.consultant.json",
];

const SOURCE_RE = /\.(ts|tsx)$/;
/** static `from "x"`, bare `import "x"`, dynamic `import("x")`, and `require("x")`. */
const IMPORT_RE = /(?:from\s*|import\s*\(?|require\s*\()\s*["']([^"']+)["']/g;

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (SOURCE_RE.test(name)) out.push(p);
  }
}

/** Resolve an import specifier to an absolute file, or null for externals. */
function resolveImport(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // node_modules / bare package

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.json`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Every module reachable from `entries`, following imports transitively. */
function reachableFrom(entries: string[]): Map<string, string[]> {
  const seen = new Map<string, string[]>(); // file → path taken to reach it
  const queue: Array<{ file: string; path: string[] }> = entries.map((f) => ({
    file: f,
    path: [f],
  }));

  while (queue.length > 0) {
    const { file, path } = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, path);
    if (!SOURCE_RE.test(file)) continue; // JSON is a leaf

    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT_RE)) {
      const target = resolveImport(m[1]!, file);
      if (target && !seen.has(target)) queue.push({ file: target, path: [...path, target] });
    }
  }
  return seen;
}

const rel = (p: string) => relative(ROOT, p);

describe("dependency boundary — the resolver itself", () => {
  it("resolves the @/ alias to src/", () => {
    const resolved = resolveImport("@/lib/discovery/client-library", join(SRC, "app/x.ts"));
    expect(resolved && rel(resolved)).toBe("src/lib/discovery/client-library.ts");
  });

  it("resolves JSON imports", () => {
    const resolved = resolveImport("@/data/discovery/discovery-library.client.json", join(SRC, "x.ts"));
    expect(resolved && rel(resolved)).toBe("src/data/discovery/discovery-library.client.json");
  });

  it("ignores bare package specifiers", () => {
    expect(resolveImport("zod", join(SRC, "x.ts"))).toBeNull();
  });

  it("follows imports transitively (proves the walk is not shallow)", () => {
    // consultant-library imports client-library, which imports the client JSON.
    // Reaching that JSON from the consultant loader takes two hops.
    const reached = reachableFrom([join(SRC, "lib/discovery/consultant-library.ts")]);
    expect([...reached.keys()].map(rel)).toContain("src/data/discovery/discovery-library.client.json");
  });
});

describe("the client library is clean at its root (INVARIANT 2)", () => {
  it("client-library.ts cannot reach the consultant dataset", () => {
    const reached = reachableFrom([join(SRC, "lib/discovery/client-library.ts")]);
    const violations = [...reached.keys()].map(rel).filter((f) => FORBIDDEN.includes(f));
    expect(violations).toEqual([]);
  });

  it("serializers.ts cannot reach the consultant dataset", () => {
    const reached = reachableFrom([join(SRC, "lib/discovery/serializers.ts")]);
    const violations = [...reached.keys()].map(rel).filter((f) => FORBIDDEN.includes(f));
    expect(violations).toEqual([]);
  });
});

describe("no (external) module reaches the consultant dataset (INVARIANT 2)", () => {
  const entries: string[] = [];
  walk(join(SRC, "app/(external)"), entries);

  it("scans a non-empty set of (external) entry points", () => {
    // The (external) tree already exists (Affirm /a/*, presales /c/*), so this
    // is a real assertion today and grows when PR-2 adds /d/*.
    expect(entries.length).toBeGreaterThan(0);
  });

  it("no (external) file imports the consultant dataset, at any depth", () => {
    const reached = reachableFrom(entries);
    const offenders: string[] = [];
    for (const [file, path] of reached) {
      if (FORBIDDEN.includes(rel(file))) {
        offenders.push(`FORBIDDEN ${rel(file)}\n    reached via: ${path.map(rel).join("\n              → ")}`);
      }
    }
    expect(
      offenders,
      `The consultant dataset is reachable from the client surface (invariant 2):\n${offenders.join("\n\n")}`,
    ).toEqual([]);
  });
});
