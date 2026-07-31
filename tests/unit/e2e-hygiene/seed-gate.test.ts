/**
 * Seed-skip hygiene — every data-absence skip goes through seedGate().
 *
 * WHY A SWEEP: 40 `test.skip(true, '… — seed required')` calls accumulated
 * across six spec files, and a green run against an unseeded database
 * asserted nothing while reporting success. The fix routes them through
 * tests/e2e/seed-gate.ts (skip by default, hard failure under
 * REQUIRE_SEED=1). Unit examples cannot catch the regression that matters —
 * someone adding the 41st raw skip — so this reads the spec tree itself.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const E2E_ROOT = resolve(__dirname, "../../e2e");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("e2e seed-skip hygiene", () => {
  const files = walk(E2E_ROOT).filter((f) => !f.endsWith("seed-gate.ts"));

  it("no spec calls test.skip(true, …) directly — use seedGate()", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // The raw pattern, in either quote style. seedGate() is the one home
      // for data-absence skips; env-flag suite gates (test.skip(!FLAG, …))
      // deliberately do not match — those gate whole suites, not seed rows.
      if (/test\.skip\(\s*true\s*,/.test(src)) offenders.push(f);
    }
    expect(offenders, "route data-absence skips through tests/e2e/seed-gate.ts").toEqual([]);
  });

  it("the gate is actually in use where the raw skips used to live", () => {
    const users = files.filter((f) => readFileSync(f, "utf8").includes("seedGate("));
    expect(users.length).toBeGreaterThanOrEqual(6);
  });
});
