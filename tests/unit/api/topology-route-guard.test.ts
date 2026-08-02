/**
 * The topology endpoint is scoped, and each lens is gated by its own workspace.
 *
 * WHY THIS ROUTE GETS ITS OWN GUARD TEST. It assembles five tables in one
 * request — solutions, interfaces, grants, credentials, connections — which
 * makes it the most disclosure-dense read in the product. An unscoped query
 * here does not leak a row; it leaks a tenant's entire integration estate and
 * the shape of who talks to whom.
 *
 * AND THE LENS IS A QUERY PARAMETER, which is the part that needs watching. The
 * three workspaces admit different roles: `support` may open the Operations
 * Center and may NOT open Control Tower. If the lens only chose a rendering
 * style, a support user could read the governance view by editing a URL. The
 * guard must be selected FROM the lens, before anything is read.
 *
 * Source-level assertions, matching the house style for guard coverage
 * (assessment-route-guard-coverage, cross-tenant-idor-guard-coverage): the
 * helpers are unit-tested elsewhere; what these protect is that the route
 * actually calls them.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROUTE = path.resolve(process.cwd(), "src/app/api/console/topology/route.ts");
const src = readFileSync(ROUTE, "utf8");

/**
 * The same source with comments removed.
 *
 * Needed for the "computes no summary" assertions below, which look for words
 * like `uptime`. The route's own header says it computes no uptime figure —
 * and a scan that cannot tell a prose denial from an implementation punishes
 * writing the denial down, which is the most useful part of the file.
 */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((line) => {
    const i = line.indexOf("//");
    return i === -1 ? line : line.slice(0, i);
  })
  .join("\n");

describe("every lens is gated by its own workspace predicate", () => {
  it.each([
    ["developer-studio", "requireStudio"],
    ["operations-center", "requireOperations"],
    ["control-tower", "requireControlTower"],
  ])("%s → %s", (lens, guard) => {
    expect(
      new RegExp(`"${lens}"\\s*:\\s*${guard}`).test(src),
      `${lens} must map to ${guard}. A shared guard would let one workspace's ` +
        "audience read another's lens by changing a query parameter.",
    ).toBe(true);
  });

  it("runs the guard before any query", () => {
    const guardAt = src.indexOf("await LENS_GUARD[lens]()");
    const firstQuery = src.indexOf("prisma.");
    expect(guardAt).toBeGreaterThan(-1);
    expect(firstQuery).toBeGreaterThan(-1);
    expect(guardAt, "the guard must resolve before the first prisma call").toBeLessThan(firstQuery);
  });

  it("refuses an unrecognised lens instead of defaulting to one", () => {
    /*
     * Defaulting would pick a workspace on the caller's behalf and then gate on
     * that choice — which is how a caller ends up reading a lens they were
     * never entitled to, via a typo.
     */
    expect(/if \(!lens\)/.test(src)).toBe(true);
    expect(src).toContain("VALIDATION_ERROR");
  });
});

describe("every query is tenant-scoped", () => {
  it("uses opsWhere on every prisma call, with no exceptions", () => {
    /*
     * `opsWhere` cannot be called without an actor, and on the scoped branch it
     * puts organizationId LAST so a caller-supplied one cannot win. A bare
     * `where:` here compiles, runs, and reads across every tenant while looking
     * identical to the scoped version.
     */
    const prismaCalls = [...src.matchAll(/prisma\.(\w+)\.(findMany|groupBy|findFirst|count)\(/g)];
    expect(prismaCalls.length, "no prisma calls found — has the route moved?").toBeGreaterThanOrEqual(6);

    const unscoped = prismaCalls.filter((m) => {
      // Look at the 260 characters after the call opens; the `where` is first.
      const window = src.slice(m.index!, m.index! + 260);
      return !window.includes("opsWhere(actor");
    });
    expect(
      unscoped.map((m) => `prisma.${m[1]}.${m[2]}`),
      "these queries do not go through opsWhere",
    ).toEqual([]);
  });

  it("does not build a where clause by hand from the actor", () => {
    // `where: { organizationId: actor.organizationId }` typechecks and is null
    // for a global admin, which silently matches nothing instead of everything.
    expect(/organizationId:\s*actor\.organizationId/.test(src)).toBe(false);
  });

  it("clamps the window through opsWindowHours rather than trusting the caller", () => {
    expect(src).toContain("opsWindowHours(");
    expect(/parseInt\(url\.searchParams\.get\("hours"\)/.test(src)).toBe(false);
  });
});

describe("it carries its provenance rather than presenting counts as totals", () => {
  it("names the audit feed as a floor", () => {
    expect(src.toLowerCase()).toContain("floor, not a census");
  });

  it("says grant attribution is inferred, because there is no grant id on an audit row", () => {
    expect(src).toContain("grantAttribution");
    expect(src.toLowerCase()).toContain("no grant id on an audit row");
  });

  it("reports what it collapsed instead of truncating silently", () => {
    expect(src).toContain("collapsed");
    expect(src).toContain("collapseColumn");
  });

  it("computes no health score or uptime figure", () => {
    // The Operations home's argument: a second copy of a number is a thing that
    // disagrees with the screen that owns it.
    for (const forbidden of ["healthScore", "uptime", "healthPercent", "availability"]) {
      expect(code.includes(forbidden), `${forbidden} must not appear in the code`).toBe(false);
    }
  });
});
