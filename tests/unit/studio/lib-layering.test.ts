/**
 * `src/lib` never imports from a `"use client"` module.
 *
 * WHAT THIS IS FOR. When a server-evaluated module imports a value from a
 * client module, Next.js substitutes a client REFERENCE — a placeholder React
 * resolves in the browser. Handed straight to a client component as a prop that
 * is fine and is how the three Console layouts have always passed their section
 * lists. READ on the server it is not: a client reference has no `.map`, no
 * `.length`, no properties at all.
 *
 * Nothing in the normal gate can see it. TypeScript type-checks against the
 * real module and is satisfied. ESLint sees an ordinary import. Vitest has no
 * notion of `"use client"` and hands back the genuine array, so every test
 * passes. It surfaces only in `next build`, as an error about a page rather
 * than about the import — which is exactly how the Console manual failed after
 * typecheck, lint and 4928 tests had all gone green.
 *
 * The rule enforced here is the one that makes the mistake unavailable rather
 * than merely detected: `src/lib` holds code both runtimes share, so it has no
 * business importing UI at all. Data both sides need lives in `src/lib` and is
 * imported by the component, never the other way round.
 *
 * This is a whole-directory rule with no heuristics and no allow-list. If a
 * genuine exception ever appears, deleting a line from this test is the
 * deliberate act it should be.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { stripSource } from "../../helpers/source";

const ROOT = resolve(__dirname, "../../..");
const SRC = join(ROOT, "src");
const LIB = join(SRC, "lib");
/**
 * ROUTE HANDLERS TOO — added after this guard missed the second occurrence.
 *
 * The original scope was `src/lib` alone, which is where the first instance
 * lived. The second was a route handler importing STUDIO_TENANT_COOKIE from a
 * `"use client"` module: it set a cookie whose NAME was the stringified client
 * reference, ~200 characters of error text, on a live deployment. It worked,
 * because every reader imported the same broken reference and agreed on the same
 * garbage — symmetric corruption reads as correctness.
 *
 * A route handler is server code with no client half at all, so the rule is the
 * same one and only the directory was missing. Scoping a guard to the place the
 * first instance happened to be is how the second one gets through.
 */
const API = join(SRC, "app", "api");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** True when the file's first non-trivial statement is the client directive. */
function isClientModule(file: string): boolean {
  let src: string;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  return /^\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n|\s)*["']use client["']/.test(src);
}

/**
 * Resolve an `@/`-aliased or relative specifier to a file on disk.
 *
 * Returns null for bare package specifiers — a node_modules import cannot be a
 * Next.js client module in the sense that matters here.
 */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(fromFile, "..", spec);
  else return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // keep trying
    }
  }
  return null;
}

/** Every static import specifier in a file, comments and strings aside. */
function importSpecifiers(src: string): string[] {
  const clean = stripSource(src, "comments");
  const out: string[] = [];
  const re = /(?:^|[\s;}])(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) out.push(m[1]!);
  // Bare side-effect imports and dynamic import() too.
  for (const bare of clean.matchAll(/(?:^|[\s;}])import\s*["']([^"']+)["']/g)) out.push(bare[1]!);
  for (const dyn of clean.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) out.push(dyn[1]!);
  return out;
}

describe("server code holds no dependency on client-only modules", () => {
  const libFiles = [...walk(LIB), ...walk(API)];

  it("finds library files to check, so a broken walk cannot pass vacuously", () => {
    // The scan's own failure mode: an empty file list asserts nothing and looks
    // identical to a clean result.
    expect(libFiles.length).toBeGreaterThan(80);
  });

  it("imports no module carrying the 'use client' directive", () => {
    const violations: string[] = [];

    for (const file of libFiles) {
      // A lib file may itself be client-only (there are a few). Those may
      // legitimately import other client modules.
      if (isClientModule(file)) continue;

      const src = readFileSync(file, "utf8");
      for (const spec of importSpecifiers(src)) {
        const target = resolveSpecifier(file, spec);
        if (target && isClientModule(target)) {
          violations.push(
            `${relative(ROOT, file)} imports "${spec}" → ${relative(ROOT, target)} ("use client")`,
          );
        }
      }
    }

    expect(
      violations,
      "A server-evaluated module imports a client module. The import will\n" +
        "type-check, lint and test cleanly, then return a client reference\n" +
        "instead of the value at `next build`. Move the shared data into a\n" +
        "module with no directive and import it from both sides:\n\n" +
        violations.join("\n"),
    ).toEqual([]);
  });

  it("detects the directive it is looking for", () => {
    // Proving the detector, not the rule: a scan that never matches `"use
    // client"` would report every directory clean forever.
    expect(isClientModule(join(SRC, "components/studio/StudioRail.tsx"))).toBe(true);
    expect(isClientModule(join(SRC, "lib/studio/sections.ts"))).toBe(false);
  });

  it("resolves the specifiers it is looking through", () => {
    // Same reason: a resolver that returns null for everything passes silently.
    const resolved = resolveSpecifier(join(LIB, "help/manual.ts"), "@/lib/studio/sections");
    expect(resolved).toBe(join(SRC, "lib/studio/sections.ts"));
  });
});
