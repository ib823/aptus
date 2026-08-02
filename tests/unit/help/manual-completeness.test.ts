/**
 * The manual covers every screen, and every entry covers a real screen.
 *
 * WHY A MANUAL NEEDS A GUARD AT ALL. Documentation is a second surface that can
 * disagree with the product, and it is the surface people trust most — so it is
 * the easiest place to reintroduce exactly the drift this codebase has spent its
 * history removing. Every disagreement found this week was two layers that each
 * looked right: the rail versus the breadcrumb, the screen versus the endpoint,
 * the UI versus the server on ownership.
 *
 * So both directions are asserted. A screen shipping undocumented is the same
 * defect class as a rail entry pointing at a 404 — and a manual entry left
 * behind after a screen is removed is the same class as a stale comment, which
 * is what said `support` did not exist for two months.
 */

import { describe, expect, it } from "vitest";

import {
  CONTROL_TOWER_SECTIONS,
  OPERATIONS_SECTIONS,
  STUDIO_SECTIONS,
} from "@/lib/studio/sections";
import { INCIDENT_RULES } from "@/lib/ops/incidents";
import { MANUAL, PROSE_KEYS, manualScreen, manualSlugForPath, INCIDENT_REFERENCE } from "@/lib/help/manual";
import { WORKSPACES } from "@/lib/studio/rbac";

const RAIL_SLUGS = [
  ...STUDIO_SECTIONS.map((s) => `developer-studio/${s.key}`),
  ...OPERATIONS_SECTIONS.map((s) => `operations-center/${s.key}`),
  ...CONTROL_TOWER_SECTIONS.map((s) => `control-tower/${s.key}`),
];

describe("every screen is documented, and every entry is a screen", () => {
  it("has an entry for every section in every rail", () => {
    const missing = RAIL_SLUGS.filter((slug) => !PROSE_KEYS.includes(slug));
    expect(
      missing,
      `These screens exist and have no manual entry:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("has no entry for a Console screen that does not exist", () => {
    /*
     * Scoped to the Console's own prose keys. The manual now also covers the
     * Workbench — Affirm, Presales, Process Discovery — whose screens come from
     * route patterns rather than a rail, because two of those three are flows
     * through a bundle with no rail to enumerate. Their both-directions check
     * lives in `workbench-routes.test.ts` and runs against the real route tree.
     *
     * Filtering here rather than widening RAIL_SLUGS keeps each guard pointed at
     * the source of truth it can actually verify: this one would have no way to
     * tell whether `affirm/questions` is real.
     */
    const consoleKeys = PROSE_KEYS.filter((key) =>
      WORKSPACES.some((w) => key.startsWith(`${w.key}/`)),
    );
    const orphans = consoleKeys.filter((key) => !RAIL_SLUGS.includes(key));
    expect(
      orphans,
      `These manual entries document nothing:\n${orphans.join("\n")}`,
    ).toEqual([]);
  });

  it("covers all three workspaces, not just the one being worked on", () => {
    for (const w of WORKSPACES) {
      const covered = MANUAL.filter((m) => m.workspace === w.key);
      expect(covered.length, `${w.label} has no documented screens`).toBeGreaterThan(0);
    }
  });
});

describe("no entry is empty, which would read as 'nothing to say'", () => {
  it.each(MANUAL.map((m) => [m.slug, m] as const))("%s", (_slug, screen) => {
    expect(screen.answers.length, "must state what the screen answers").toBeGreaterThan(20);
    // The section this manual exists for. An entry with nothing here is an
    // entry that has not done the one job the manual is for.
    expect(
      screen.cannotTell.length,
      "must state at least one thing the screen cannot establish",
    ).toBeGreaterThan(0);
    for (const c of screen.cannotTell) expect(c.length).toBeGreaterThan(20);
  });
});

describe("structural facts are derived, not restated", () => {
  it("takes titles and hrefs from the rail itself", () => {
    for (const section of OPERATIONS_SECTIONS) {
      const entry = manualScreen(`operations-center/${section.key}`);
      expect(entry?.title).toBe(section.label);
      // Null when the screen is not built — never a link to a 404.
      expect(entry?.href).toBe(section.available ? section.href : null);
    }
  });

  it("computes who may open a workspace from the real predicates", () => {
    // Support runs the Operations Center and must not appear on Control Tower —
    // the distinction that would look correct either way in a hand-written table.
    const ops = manualScreen("operations-center/incidents");
    const tower = manualScreen("control-tower/grants");
    expect(ops?.openTo).toContain("Support");
    expect(tower?.openTo).not.toContain("Support");
    expect(tower?.openTo).toContain("Partner Lead");
  });

  it("renders the incident rules from the constants the endpoint scores with", () => {
    // Not a copy: a threshold change must move this page too, which is why the
    // severities are named constants rather than inline comparisons.
    expect(INCIDENT_REFERENCE).toHaveLength(Object.keys(INCIDENT_RULES).length);
    const binding = INCIDENT_REFERENCE.find((r) => r.id === INCIDENT_RULES.bindingRefused.id);
    expect(binding?.severity).toBe(INCIDENT_RULES.bindingRefused.severity);
    expect(binding?.firesWhen).toBe(INCIDENT_RULES.bindingRefused.firesWhen);
  });
});

describe("the contextual help control resolves a real page or nothing", () => {
  it("finds the entry for each built screen's own path", () => {
    for (const screen of MANUAL) {
      if (!screen.href) continue;
      expect(manualSlugForPath(screen.href), screen.href).toBe(screen.slug);
    }
  });

  it("prefers the deepest match, so a sub-page is not answered by its workspace home", () => {
    expect(manualSlugForPath("/operations/connections")).toBe("operations-center/connections");
    expect(manualSlugForPath("/control-tower/tokens")).toBe("control-tower/tokens");
  });

  it("returns nothing off the documented product, so the control hides rather than guesses", () => {
    // A "?" linking to a page about a different product is worse than no "?".
    // `/presales` used to belong in this list and no longer does: it is a
    // documented workspace now, and resolving it is the point.
    for (const outside of ["/dashboard", "/assessments/123", "/workshops/join", "/"]) {
      expect(manualSlugForPath(outside), outside).toBeNull();
    }
  });

  it("resolves Workbench stages without a bundle id swallowing its siblings", () => {
    /*
     * `/affirm/{bundle}` matches `/affirm/new` perfectly well and would win on
     * length, pointing a consultant creating a bundle at the manual page for the
     * client's answering screen. Specificity is counted in literal segments, so
     * the real screen wins.
     */
    expect(manualSlugForPath("/affirm/new")).toBe("affirm/new");
    expect(manualSlugForPath("/affirm/clx123")).toBe("affirm/client");
    expect(manualSlugForPath("/affirm/clx123/questions")).toBe("affirm/questions");
    expect(manualSlugForPath("/presales/settings")).toBe("presales/settings");
    expect(manualSlugForPath("/presales/clx123/audit")).toBe("presales/audit");
    expect(manualSlugForPath("/discovery/library")).toBe("discovery/library");
  });
});
