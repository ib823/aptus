/**
 * A route file may only export what Next.js allows it to export.
 *
 * WHY THIS EXISTS. `src/app/**\/route.ts` files are compiled against a generated
 * type that permits a fixed set of names: the HTTP verbs, and a handful of
 * segment-config options. Export anything else — a constant, a helper, a type —
 * and `next build` fails with:
 *
 *     Type error: Route "…/route.ts" does not match the required types of a
 *     Next.js Route. "X" is not a valid Route export field.
 *
 * AND NOTHING ELSE CATCHES IT. `tsc --noEmit --strict` passes, ESLint passes,
 * and the full vitest suite passes, because the constraint lives in a type Next
 * generates during its own build. This repository has now hit that class of
 * defect twice: an invalid Prisma `select` that only `next build` rejected, and
 * an `export const THROTTLE_BUCKETS` in the throttle route. Both were found by a
 * three-minute production build, which is the slowest feedback loop available.
 *
 * The fix each time is the same and is a better design anyway: the constant
 * belongs in `lib`, and the route reads it. This test states that rule so it
 * fails in a second rather than at the end of a build — and so the reason is
 * written down rather than rediscovered.
 *
 * Deliberately a source scan and not a type test: the offending export compiles
 * perfectly on its own, which is the whole problem.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const APP_DIR = path.resolve(__dirname, "../../../src/app");

/**
 * What Next.js accepts from a Route Handler.
 * https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
 */
const ALLOWED_ROUTE_EXPORTS = new Set([
  // Handlers
  "GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS",
  // Segment config
  "dynamic", "dynamicParams", "revalidate", "fetchCache", "runtime",
  "preferredRegion", "maxDuration", "generateStaticParams",
]);

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * Top-level exported VALUE names. Types are erased before Next sees the module,
 * so `export type` and `export interface` are not constrained — matching them
 * would produce false failures on files that build fine.
 */
function exportedValues(src: string): string[] {
  const names: string[] = [];
  const patterns = [
    /^export\s+(?:async\s+)?function\s+(\w+)/gm,
    /^export\s+(?:const|let|var)\s+(\w+)/gm,
    /^export\s+class\s+(\w+)/gm,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) names.push(m[1]!);
  }
  // `export { a, b }` — but not `export type { … }`.
  for (const m of src.matchAll(/^export\s+\{([^}]*)\}/gm)) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name && !name.startsWith("type ")) names.push(name);
    }
  }
  return names;
}

const routeFiles = walk(APP_DIR).filter((f) => /(^|\/)route\.tsx?$/.test(f));

describe("route handlers export only what Next.js permits", () => {
  it("finds route files to check (a dead guard is worse than none)", () => {
    expect(routeFiles.length).toBeGreaterThan(20);
  });

  it("no route file exports a name Next.js will reject at build time", () => {
    const offenders: string[] = [];

    for (const file of routeFiles) {
      const src = readFileSync(file, "utf8");
      for (const name of exportedValues(src)) {
        if (!ALLOWED_ROUTE_EXPORTS.has(name)) {
          offenders.push(`${file.replace(`${path.resolve(APP_DIR, "../..")}/`, "")} exports \`${name}\``);
        }
      }
    }

    expect(
      offenders,
      "These will fail `next build` with \"is not a valid Route export field\".\n" +
        "Move the value into `src/lib/…` and import it — which is where it belongs\n" +
        "anyway, since a route should read shared configuration rather than own it:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("the detector actually detects (guard against a dead guard)", () => {
    // Without this, a broken `exportedValues` would make the scan above pass
    // vacuously — which is exactly the failure mode this file exists to prevent
    // in the first place.
    expect(exportedValues("export const THROTTLE_BUCKETS = [];")).toEqual(["THROTTLE_BUCKETS"]);
    expect(exportedValues("export async function GET() {}")).toEqual(["GET"]);
    expect(exportedValues("export class Thing {}")).toEqual(["Thing"]);
    expect(exportedValues("export { helper };")).toEqual(["helper"]);
    // Types are erased and are not constrained by Next.
    expect(exportedValues("export type Foo = string;")).toEqual([]);
    expect(exportedValues("export interface Bar { a: string }")).toEqual([]);
    // A non-exported constant is fine and must not be flagged.
    expect(exportedValues("const LOCAL = 1;")).toEqual([]);
  });
});
