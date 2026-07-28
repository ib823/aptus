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
} from "@/components/studio/StudioRail";
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

  it("has no entry for a screen that does not exist", () => {
    const orphans = PROSE_KEYS.filter((key) => !RAIL_SLUGS.includes(key));
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
    const binding = INCIDENT_REFERENCE.find((r) => r.id === INCIDENT_RULES.bindingMismatch.id);
    expect(binding?.severity).toBe(INCIDENT_RULES.bindingMismatch.severity);
    expect(binding?.firesWhen).toBe(INCIDENT_RULES.bindingMismatch.firesWhen);
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

  it("returns nothing off the Console, so the control hides rather than guesses", () => {
    // A "?" linking to a page about a different product is worse than no "?".
    for (const outside of ["/dashboard", "/assessments/123", "/presales", "/"]) {
      expect(manualSlugForPath(outside), outside).toBeNull();
    }
  });
});
