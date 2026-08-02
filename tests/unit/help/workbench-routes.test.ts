/**
 * Every documented Workbench screen is a real route, and every route is documented.
 *
 * The Console gets this guarantee from its rail: the manual is assembled from
 * the same section lists the rail renders, so the two cannot disagree. The
 * Workbench has no equivalent — Affirm and Presales are flows through a bundle
 * with nothing to enumerate — so the guarantee is taken from the route tree
 * instead, which is a stronger source: the routes cannot be out of date with
 * themselves.
 *
 * Both directions matter, and they fail for different reasons:
 *
 *   · a documented pattern with no page  → the manual links or points somewhere
 *     that 404s, which is the defect the Console rail's `available` flag exists
 *     to prevent
 *   · a page with no documented pattern  → a screen shipped undocumented, which
 *     is how the Workbench came to have no manual at all
 *
 * The second is the one that rots quietly. Nobody notices an absent page.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MANUAL } from "@/lib/help/manual";
import {
  AFFIRM_SECTIONS,
  DISCOVERY_SECTIONS,
  PRESALES_SECTIONS,
  normaliseRoute,
  type WorkbenchSection,
} from "@/lib/workbench/sections";

const WORKBENCH_ROOT = path.resolve(process.cwd(), "src/app/(workbench)");

/** Every `page.tsx` under (workbench), as a route path with `[param]` intact. */
function routeFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Route groups `(name)` do not appear in the URL.
      const segment = entry.startsWith("(") && entry.endsWith(")") ? prefix : `${prefix}/${entry}`;
      out.push(...routeFiles(full, segment));
    } else if (entry === "page.tsx") {
      out.push(prefix === "" ? "/" : prefix);
    }
  }
  return out;
}

const ALL_ROUTES = routeFiles(WORKBENCH_ROOT).sort();

/** The three workspaces this manual covers, and their route roots. */
const COVERED: { name: string; root: string; sections: readonly WorkbenchSection[] }[] = [
  { name: "affirm", root: "/affirm", sections: AFFIRM_SECTIONS },
  { name: "presales", root: "/presales", sections: PRESALES_SECTIONS },
  { name: "discovery", root: "/discovery", sections: DISCOVERY_SECTIONS },
];

/**
 * Routes that exist and are deliberately NOT documented as screens.
 *
 * Named individually with a reason, rather than pattern-matched away: a blanket
 * exclusion is how a real screen goes missing. Each of these is a sub-page of a
 * documented screen, reached from it and explained by its entry.
 */
const NOT_SEPARATE_SCREENS: Record<string, string> = {
  "/discovery/library/[id]":
    "One process's detail drawer — opened from Library, documented by it.",
  "/discovery/sessions/new": "The create form inside Sessions.",
  "/discovery/sessions/[id]": "One session, opened from Sessions.",
  "/discovery/sessions/[id]/facilitate":
    "Running a session — a mode of one session, not a separate destination.",
  "/discovery/outputs/[id]": "One engagement's outputs, opened from Outputs.",
};

describe("the route tree was actually walked", () => {
  it("found the Workbench pages, so the assertions below mean something", () => {
    // A broken walk would return [] and every other test here would vacuously
    // pass — the exact failure mode this file exists to prevent elsewhere.
    expect(ALL_ROUTES.length).toBeGreaterThan(20);
    expect(ALL_ROUTES).toContain("/affirm");
    expect(ALL_ROUTES).toContain("/presales/settings");
    expect(ALL_ROUTES).toContain("/discovery/health");
  });
});

describe("every documented screen resolves to a real page", () => {
  it.each(COVERED.map((c) => [c.name, c] as const))("%s", (_name, { sections }) => {
    const present = new Set(ALL_ROUTES.map(normaliseRoute));
    const missing = sections
      .map((s) => s.pattern)
      .filter((pattern) => !present.has(normaliseRoute(pattern)));
    expect(
      missing,
      `Documented in src/lib/workbench/sections.ts with no page.tsx behind it:\n${missing.join("\n")}`,
    ).toEqual([]);
  });
});

describe("every page is documented, or named as deliberately not a screen", () => {
  it.each(COVERED.map((c) => [c.name, c] as const))("%s", (_name, { root, sections }) => {
    const documented = new Set(sections.map((s) => normaliseRoute(s.pattern)));
    const excluded = new Set(Object.keys(NOT_SEPARATE_SCREENS).map(normaliseRoute));
    const undocumented = ALL_ROUTES.filter(
      (r) =>
        (r === root || r.startsWith(`${root}/`)) &&
        !documented.has(normaliseRoute(r)) &&
        !excluded.has(normaliseRoute(r)),
    );
    expect(
      undocumented,
      "These screens ship with no manual entry. Add one to src/lib/help/workbench-manual.ts,\n" +
        "or list it in NOT_SEPARATE_SCREENS here with the reason it is not its own destination:\n" +
        undocumented.join("\n"),
    ).toEqual([]);
  });

  it("has no stale exclusion left behind after a route was removed", () => {
    const present = new Set(ALL_ROUTES.map(normaliseRoute));
    const stale = Object.keys(NOT_SEPARATE_SCREENS).filter((r) => !present.has(normaliseRoute(r)));
    expect(stale, "excluded routes that no longer exist").toEqual([]);
  });
});

describe("the manual entries are complete prose, not placeholders", () => {
  const workbench = MANUAL.filter((m) =>
    ["affirm", "presales", "discovery"].includes(m.workspace),
  );

  it("covers all three workspaces", () => {
    expect(workbench.filter((m) => m.workspace === "affirm").length).toBe(AFFIRM_SECTIONS.length);
    expect(workbench.filter((m) => m.workspace === "presales").length).toBe(PRESALES_SECTIONS.length);
    expect(workbench.filter((m) => m.workspace === "discovery").length).toBe(
      DISCOVERY_SECTIONS.length,
    );
  });

  it.each(workbench.map((m) => [m.slug, m] as const))("%s", (_slug, screen) => {
    expect(screen.answers.length, "must state what the screen answers").toBeGreaterThan(20);
    expect(
      screen.cannotTell.length,
      "must state at least one thing the screen cannot establish",
    ).toBeGreaterThan(0);
    for (const c of screen.cannotTell) expect(c.length).toBeGreaterThan(20);
  });

  it("gives directions for every screen that has no address", () => {
    // A stage inside a bundle has no URL, so the entry has to say how to reach
    // it. Without that the page renders a route pattern and nothing else, which
    // reads as documentation of something unreachable.
    const stranded = workbench
      .filter((m) => m.href === null && !m.reachedBy)
      .map((m) => m.slug);
    expect(stranded, "screens with neither a link nor directions").toEqual([]);
  });

  it("does not give directions for a screen that has a link", () => {
    const redundant = workbench.filter((m) => m.href !== null && m.reachedBy).map((m) => m.slug);
    expect(redundant, "a link and directions is one of them being wrong").toEqual([]);
  });
});
