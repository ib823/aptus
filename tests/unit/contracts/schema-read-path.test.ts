// @vitest-environment node
/**
 * GET /schema NEVER RENDERS (P1.3). The one high-frequency, consumer-facing
 * read of a contract serves the texts the record rendered once, in the
 * compiler's worker; nothing it loads can render a contract, start a worker
 * or spend compiler time. Held statically: following every value import
 * from the route (and its /v1 alias), transitively, none of these modules is
 * reached. Type-only imports are erased and not followed.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const SRC = path.join(ROOT, "src");

/** What /schema must never load: the envelope, the jobs, the worker, the compiler's time, and the renderers. */
const FORBIDDEN = [
  "src/lib/contracts/envelope.ts",
  "src/lib/contracts/jobs.ts",
  "src/lib/contracts/compile.worker.ts",
  "src/lib/contracts/contract-time.ts",
  "src/lib/contracts/json-schema.ts",
  "src/lib/contracts/openapi.ts",
  "src/lib/contracts/compile.ts",
  "src/lib/studio/scaffold.ts",
];

/** The value imports of a module: `import … from "x"` and `export … from "x"`, not `import type`. */
function valueImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(/^(?:import|export)\s+([^;]*?)\s+from\s+["']([^"']+)["']/gm)) {
    const clause = m[1]!.trim();
    if (clause.startsWith("type ")) continue;
    // `import { type A, type B } from …` (no default, every name a type) imports no value.
    const names = /^\{([^}]*)\}$/.exec(clause)?.[1];
    if (names !== undefined && names.split(",").every((n) => n.trim() === "" || n.trim().startsWith("type "))) continue;
    out.push(m[2]!);
  }
  // Side-effect imports.
  for (const m of text.matchAll(/^import\s+["']([^"']+)["']/gm)) out.push(m[1]!);
  return out;
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && candidate.match(/\.tsx?$/)) return candidate;
  }
  return null;
}

/** Every module reached from `entry` through value imports, with the chain that reached it. */
function reached(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const spec of valueImports(file)) {
      const next = resolve(file, spec);
      if (next === null || seen.has(next)) continue;
      seen.set(next, [...seen.get(file)!, next]);
      queue.push(next);
    }
  }
  return seen;
}

describe("GET /schema and its /v1 alias load nothing that renders, compiles or spends compiler time", () => {
  for (const route of ["src/app/api/northbound/interfaces/[id]/schema/route.ts", "src/app/api/northbound/v1/interfaces/[id]/schema/route.ts"]) {
    it(route, () => {
      const graph = reached(path.join(ROOT, route));
      // It does reach what it serves from: the stored texts and the splice.
      expect(graph.has(path.join(ROOT, "src/lib/contracts/raw-json.ts"))).toBe(true);
      expect(graph.has(path.join(ROOT, "src/lib/contracts/snapshot.ts"))).toBe(true);
      for (const f of FORBIDDEN) {
        const chain = graph.get(path.join(ROOT, f));
        expect(chain?.map((c) => path.relative(ROOT, c)).join(" -> ") ?? null, f).toBeNull();
      }
    });
  }

  it("and the import reader sees a forbidden module where one is imported (the test can fail)", () => {
    const graph = reached(path.join(ROOT, "src/app/api/studio/interfaces/[id]/scaffold/route.ts"));
    expect(graph.has(path.join(ROOT, "src/lib/contracts/envelope.ts"))).toBe(true);
  });
});

/*
 * NOTHING RE-RENDERS STORED /SCHEMA TEXTS OUTSIDE A TENANT'S JOB
 * (consolidated containment review round 5). The build re-rendered every
 * organisation's rows against production before `next build`, only ever
 * forward, so a failed build or an Instant Rollback left the live deployment
 * serving a newer render than its kit and document. The texts are written
 * only where a verify or a capture records (snapshot.ts, setSchemaTexts),
 * and the build runs no contracts script.
 */
describe("the /schema texts are written only by a record or a capture", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? files(full) : /\.(ts|tsx|mjs|js)$/.test(e.name) ? [full] : [];
    });

  it("no module but snapshot.ts writes them", () => {
    const writers = [...files(SRC), ...files(path.join(ROOT, "scripts"))]
      .filter((f) => /"schemasText"\s*=/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f));
    expect(writers).toEqual(["src/lib/contracts/snapshot.ts"]);
  });

  it("vercel-build renders no contract", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["vercel-build"]).not.toMatch(/rerender|schema-texts|contracts/);
  });
});
