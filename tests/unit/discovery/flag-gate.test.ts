/**
 * ABeam Workbench — every /d route is flag-gated.
 *
 * The deploy plan merges PR-1..6 to main with NEUTRAL_DISCOVERY_ENABLED unset,
 * and relies on "/d/anything 404s in prod". The e2e that proves the actual 404
 * lives in tests/e2e/discovery-flag-off.unauth.spec.ts — but it cannot run
 * without a database (global-setup opens Prisma before any spec), so this is the
 * runnable half.
 *
 * It is a STATIC check: it proves each route module reaches a flag gate, not
 * that the response is 404. The e2e remains the real evidence. What this catches
 * is the realistic regression — someone adds a /d route in PR-2b..6 and forgets
 * the check — which would otherwise sit undetected until a preview deploy.
 *
 * Two ways to be gated:
 *   - call isNeutralDiscoveryEnabled() directly, or
 *   - call requireGuestSession(), which returns null when the flag is off (its
 *     first line) and whose callers redirect to the terminal.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const D_ROOT = join(process.cwd(), "src/app/(external)/d");

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
    else if (/^(page|route)\.tsx?$/.test(name)) out.push(p);
  }
}

const rel = (p: string) => p.replace(process.cwd() + "/", "");

describe("every /d route module is flag-gated", () => {
  const routes: string[] = [];
  walk(D_ROOT, routes);

  it("finds the /d route modules (not vacuous)", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it("each page/route reaches a flag gate", () => {
    const ungated = routes.filter((f) => {
      const src = readFileSync(f, "utf8");
      return (
        !src.includes("isNeutralDiscoveryEnabled") && !src.includes("requireGuestSession")
      );
    });
    expect(
      ungated.map(rel),
      `These /d routes are not flag-gated — they would be reachable in production with the flag unset:\n${ungated.map(rel).join("\n")}`,
    ).toEqual([]);
  });

  it("the flag helper is defined exactly once", () => {
    // It was briefly defined twice (lib/discovery/guards.ts and
    // lib/discovery/external/guards.ts). A duplicated kill-switch is one that
    // drifts: "the flag is off" must mean one thing everywhere.
    const libFiles: string[] = [];
    const walkAll = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walkAll(p);
        else if (/\.ts$/.test(name)) libFiles.push(p);
      }
    };
    walkAll(join(process.cwd(), "src/lib/discovery"));

    const definitions = libFiles.filter((f) =>
      /export function isNeutralDiscoveryEnabled/.test(readFileSync(f, "utf8")),
    );
    expect(definitions.map(rel)).toEqual(["src/lib/discovery/guards.ts"]);
  });

  it("the gate reads NEUTRAL_DISCOVERY_ENABLED and requires exactly \"true\"", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/discovery/guards.ts"), "utf8");
    // Fail-closed: anything other than the literal "true" leaves it off, so an
    // accidental "1" or "yes" in an env file does not silently expose /d.
    expect(src).toContain('process.env.NEUTRAL_DISCOVERY_ENABLED === "true"');
  });
});
