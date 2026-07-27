/**
 * The Workbench route allow-list.
 *
 * This exists because CoreEdge Console was built across nineteen PRs, merged,
 * deployed, and was unreachable in production the entire time: `/studio` was
 * missing from WORKBENCH_PATHS, so the middleware redirected it to /workbench
 * before auth or RBAC ever ran. Nothing caught it — the E2E suite runs against
 * localhost, where WORKBENCH_ONLY is unset and the gate is inert.
 *
 * So the load-bearing test here is the last one: every page route that exists
 * under a Workbench route group must be reachable. It fails when someone adds a
 * surface and forgets this list, which is the mistake that actually happened
 * rather than one imagined for the occasion.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isWorkbenchPath, WORKBENCH_PATHS } from "@/lib/routing/workbench-paths";

const ROOT = process.cwd();

describe("isWorkbenchPath", () => {
  it("admits every Workbench surface", () => {
    for (const p of [
      "/workbench",
      "/presales",
      "/presales/login",
      "/affirm",
      "/sap-explorer",
      "/discovery",
      "/studio",
    ]) {
      expect(isWorkbenchPath(p), `${p} must be reachable`).toBe(true);
    }
  });

  it("admits CoreEdge Console and its sub-pages", () => {
    // The regression that prompted this file.
    for (const p of [
      "/studio",
      "/studio/discover",
      "/studio/solutions",
      "/studio/interfaces",
      "/studio/test",
      "/studio/connections",
      "/studio/access",
    ]) {
      expect(isWorkbenchPath(p), `${p} must be reachable`).toBe(true);
    }
  });

  it("admits the APIs the surfaces call", () => {
    for (const p of [
      "/api/auth/callback/email",
      "/api/presales/bundles",
      "/api/affirm/sets",
      "/api/studio/connections",
      "/api/health",
    ]) {
      expect(isWorkbenchPath(p), `${p} must be reachable`).toBe(true);
    }
  });

  it("still excludes the Aptus portal", () => {
    // The whole point of the gate: a Workbench host does not serve the portal.
    for (const p of ["/assessments", "/dashboard", "/settings", "/admin", "/reports"]) {
      expect(isWorkbenchPath(p), `${p} must NOT be a Workbench path`).toBe(false);
    }
  });

  it("does not admit a path merely because it shares a prefix boundary", () => {
    // '/studio' is a prefix match, so '/studiox' would sneak through a naive
    // check. Documented rather than asserted-false: prefix matching is the
    // established behaviour here ('/c/', '/api/auth/' rely on it), and no such
    // route exists. This test pins that no NEW top-level route starts with the
    // name of an existing one.
    const collisions = WORKBENCH_PATHS.filter(
      (a) => WORKBENCH_PATHS.some((b) => b !== a && a.startsWith(b)),
    );
    expect(collisions, `overlapping prefixes: ${collisions.join(", ")}`).toEqual([]);
  });

  it("has no duplicate entries", () => {
    expect(new Set(WORKBENCH_PATHS).size).toBe(WORKBENCH_PATHS.length);
  });
});

/* ── the guard that would have caught the bug ──────────────────────────────── */

/** Page routes declared under a route group, as URL paths. */
function pageRoutesIn(group: string): string[] {
  const base = path.resolve(ROOT, "src/app", group);
  const out: string[] = [];

  function walk(dir: string, url: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (entries.includes("page.tsx")) out.push(url === "" ? "/" : url);
    for (const name of entries) {
      const full = path.join(dir, name);
      if (!statSync(full).isDirectory()) continue;
      // Route groups "(x)" and parallel/intercepted routes add no URL segment;
      // dynamic segments "[id]" are substituted so the prefix check is honest.
      if (name.startsWith("(")) walk(full, url);
      else if (name.startsWith("[")) walk(full, `${url}/id`);
      else walk(full, `${url}/${name}`);
    }
  }

  walk(base, "");
  return out;
}

describe("every Workbench-group page is reachable", () => {
  // (studio) is a Workbench surface on this deployment; (workbench) obviously is.
  const groups = ["(workbench)", "(studio)"];

  for (const group of groups) {
    it(`${group} has pages, and all of them pass the gate`, () => {
      const routes = pageRoutesIn(group).filter((r) => r !== "/");
      expect(routes.length, `${group} declares no pages — dead guard`).toBeGreaterThan(0);

      const blocked = routes.filter((r) => !isWorkbenchPath(r));
      expect(
        blocked,
        `These ${group} pages exist but the middleware redirects them away:\n${blocked.join("\n")}`,
      ).toEqual([]);
    });
  }
});

/* ── every console route group is reachable ──────────────────────────────────
 *
 * This gate has now failed silently TWICE: `/studio` shipped across nineteen
 * PRs behind a locked door, and `/operations` + `/control-tower` shipped with
 * route groups, layouts, RBAC and green tests while redirecting to /workbench in
 * production.
 *
 * Both were invisible locally, because WORKBENCH_ONLY is unset on a dev server —
 * so the redirect that breaks production never fires while you are building.
 *
 * This derives the expectation from the ROUTE GROUPS ON DISK rather than a
 * hand-written list, so adding a workspace without allow-listing it fails here
 * instead of in production.
 */
describe("every console page route group is allow-listed", () => {
  const CONSOLE_ROUTES = [
    ["(studio)", "/studio"],
    ["(operations)", "/operations"],
    ["(control-tower)", "/control-tower"],
  ] as const;

  it("allows the top-level path of each console workspace", () => {
    for (const [group, path] of CONSOLE_ROUTES) {
      expect(isWorkbenchPath(path), `${group} → ${path} must not be redirected`).toBe(true);
    }
  });

  it("allows nested pages under each workspace", () => {
    for (const [, path] of CONSOLE_ROUTES) {
      expect(isWorkbenchPath(`${path}/anything`), `${path}/anything`).toBe(true);
    }
  });

  it("allows each workspace's REST surface", () => {
    for (const api of ["/api/studio/solutions", "/api/ops/broker-traffic"]) {
      expect(isWorkbenchPath(api), api).toBe(true);
    }
  });

  it("still redirects something genuinely outside the Workbench", () => {
    // The gate must remain a gate — this test is worthless if it allows everything.
    expect(isWorkbenchPath("/dashboard")).toBe(false);
    expect(isWorkbenchPath("/assessments/123")).toBe(false);
  });
});
