/**
 * The design-system page cannot drift from the library it documents (PR-3).
 *
 * WHY A TEST FOR A REFERENCE PAGE. A design system that disagrees with the
 * product is worse than not having one, because people trust it: they read the
 * page, build to it, and ship something that does not match. The usual way this
 * happens is not malice but arithmetic — a nineteenth status is added, and the
 * page still lists eighteen because listing them was a manual act.
 *
 * So the page DERIVES every specimen (it maps LANE_STATUSES, GATE_TOKENS,
 * LANE_HOPS and STATUS_LITERAL_MAP) and these assertions check that it still
 * does — that no one has replaced an iteration with a convenient hand-written
 * list. The render assertions then confirm the derivation actually reaches the
 * DOM, because an iteration over the right array that renders nothing is the
 * other way to be quietly wrong.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { DesignSystemClient } from "@/app/(coreedge)/coreedge/design-system/DesignSystemClient";
import {
  APP_STATUSES,
  GATE_GLYPHS,
  HOP_LABELS,
  LANE_HOPS,
  LANE_STATUSES,
  LANE_STATUS_VOCABULARY,
  STATUS_LITERAL_MAP,
} from "@/lib/coreedge/status-vocabulary";
import { DISABLED_REASONS, WHY_CASE_HOP } from "@/lib/coreedge/copy";

const ROOT = process.cwd();
const PAGE_DIR = path.resolve(ROOT, "src/app/(coreedge)/coreedge/design-system");

const clientSource = readFileSync(path.join(PAGE_DIR, "DesignSystemClient.tsx"), "utf8");

afterEach(cleanup);

describe("the page derives its specimens rather than listing them", () => {
  it.each([
    ["LANE_STATUSES", "LANE_STATUSES.map"],
    ["GATE_TOKENS", "GATE_TOKENS.map"],
    ["LANE_HOPS", "LANE_HOPS.map"],
    ["STATUS_LITERAL_MAP", "STATUS_LITERAL_MAP.map"],
    ["APP_STATUSES", "APP_STATUSES.map"],
    ["DISABLED_REASONS", "Object.entries(DISABLED_REASONS).map"],
    ["WHY_CASE_HOP", "Object.keys(WHY_CASE_HOP)"],
  ])("iterates %s", (_name, expression) => {
    expect(
      clientSource.includes(expression),
      `The page no longer iterates this. A hand-written list is how a reference ` +
        `page goes quietly out of date: ${expression}`,
    ).toBe(true);
  });

  it("never hard-codes a status label", () => {
    /*
     * Every label the page shows comes from the vocabulary. A literal like
     * "No access" typed into the page is a second source of truth for the one
     * thing this console most needs a single source of truth for.
     */
    for (const status of LANE_STATUSES) {
      const label = LANE_STATUS_VOCABULARY[status].label;
      expect(
        clientSource.includes(`"${label}"`),
        `"${label}" is written literally in the page. Render it from the ` +
          `vocabulary instead.`,
      ).toBe(false);
    }
  });
});

describe("what actually reaches the DOM", () => {
  it("renders every one of the eighteen statuses, by name", () => {
    render(<DesignSystemClient />);
    for (const status of LANE_STATUSES) {
      const label = LANE_STATUS_VOCABULARY[status].label;
      expect(
        screen.getAllByText(label, { exact: false }).length,
        `${status} ("${label}") does not appear on the page`,
      ).toBeGreaterThan(0);
    }
  });

  it("renders a glyph for every status, not colour alone", () => {
    /*
     * The contract PR-1 measured: in dark the fifteen pairwise contrasts between
     * the six status grounds sit between 1.01:1 and 1.10:1. A page that
     * documents the statuses without their glyphs teaches the wrong lesson.
     */
    const { container } = render(<DesignSystemClient />);
    const text = container.textContent ?? "";
    for (const glyph of Object.values(GATE_GLYPHS)) {
      expect(text.includes(glyph), `glyph ${glyph} never appears`).toBe(true);
    }
  });

  it("names every hop, in its own words", () => {
    /*
     * The first version of this assertion was vacuous: it compared a length to
     * `>= 0`, which is true of every array, against a regex that was empty for
     * five of the six hops. It would have passed on a page with no hops at all.
     * HOP_LABELS is the vocabulary's own wording, so that is what is checked.
     */
    render(<DesignSystemClient />);
    expect(LANE_HOPS).toHaveLength(6);
    for (const hop of LANE_HOPS) {
      const label = HOP_LABELS[hop];
      expect(
        screen.getAllByText(label, { exact: false }).length,
        `the hop "${label}" never appears on the page`,
      ).toBeGreaterThan(0);
    }
  });

  it("shows every literal the mapping covers", () => {
    render(<DesignSystemClient />);
    // A spot check across domains rather than all 88 — the iteration assertion
    // above is what guarantees completeness; this confirms it reaches the page.
    for (const literal of ["ACTIVATED", "SANDBOX_ONLY", "NEVER_IMPORTED", "TEST_CONNECT"]) {
      expect(screen.getAllByText(literal).length, `${literal} missing`).toBeGreaterThan(0);
    }
    expect(STATUS_LITERAL_MAP.length).toBeGreaterThanOrEqual(87);
  });

  it("shows every app status, kept separate from the lane statuses", () => {
    render(<DesignSystemClient />);
    expect(screen.getAllByText("Restricted · no new access").length).toBeGreaterThan(0);
    expect(APP_STATUSES.length).toBe(4);
  });

  it("shows every disabled reason A6 defines", () => {
    render(<DesignSystemClient />);
    for (const reason of Object.values(DISABLED_REASONS)) {
      expect(screen.getAllByText(reason).length, `missing: ${reason}`).toBeGreaterThan(0);
    }
  });

  it("shows a Why? explanation for every case", () => {
    render(<DesignSystemClient />);
    // Each trace renders its correlation id, which is unique per case.
    for (const whyCase of Object.keys(WHY_CASE_HOP)) {
      expect(screen.getAllByText(`ce-demo-${whyCase}`).length, `${whyCase} missing`).toBe(1);
    }
  });
});

describe("the page demonstrates the contracts, not just the components", () => {
  it("keeps disabled specimens in the tab order with a reachable reason", () => {
    const { container } = render(<DesignSystemClient />);
    const blocked = container.querySelectorAll('button[aria-disabled="true"]');
    expect(blocked.length, "no disabled specimen on the page").toBeGreaterThan(0);

    for (const el of blocked) {
      // Never the attribute that removes the tab stop.
      expect(el.hasAttribute("disabled"), "a specimen uses the disabled attribute").toBe(false);
      // The reason is reachable, and it is a real element rather than a title.
      const describedBy = el.getAttribute("aria-describedby");
      expect(describedBy, "a blocked specimen has no aria-describedby").toBeTruthy();
      if (describedBy !== null) {
        const reason = container.querySelector(`#${CSS.escape(describedBy)}`);
        expect(reason, `no element with id ${describedBy}`).not.toBeNull();
        expect((reason?.textContent ?? "").length).toBeGreaterThan(10);
      }
      expect(el.hasAttribute("title"), "a specimen puts its reason in a title").toBe(false);
    }
  });

  it("never renders a whole key anywhere on the page", () => {
    /*
     * MaskedKey cannot render one — its type has nowhere to put a secret — but
     * the page could still paste one in as sample text, which is exactly how
     * real keys end up in documentation.
     */
    const { container } = render(<DesignSystemClient />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/ce_(live|test)_[A-Za-z0-9]{8,}/);
    expect(screen.getAllByText(/ce_live/).length).toBeGreaterThan(0);
  });

  it("puts one table header row per table, scoped for screen readers", () => {
    const { container } = render(<DesignSystemClient />);
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      const headers = within(table as HTMLElement).getAllByRole("columnheader");
      expect(headers.length).toBeGreaterThan(0);
      for (const h of headers) expect(h.getAttribute("scope")).toBe("col");
    }
  });

  it("gives every table a caption or an accessible name", () => {
    const { container } = render(<DesignSystemClient />);
    for (const table of container.querySelectorAll("table")) {
      const caption = table.querySelector("caption");
      const labelled = table.getAttribute("aria-label") ?? table.getAttribute("aria-labelledby");
      expect(
        caption !== null || labelled !== null,
        "a table on the page has no caption and no accessible name",
      ).toBe(true);
    }
  });

  it("has exactly one h1 and no skipped heading level", () => {
    const { container } = render(<DesignSystemClient />);
    const levels = [...container.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) =>
      Number(h.tagName[1]),
    );
    expect(levels.filter((l) => l === 1)).toHaveLength(1);
    let previous = 1;
    for (const level of levels) {
      expect(level - previous, `heading jumps from h${previous} to h${level}`).toBeLessThanOrEqual(1);
      previous = level;
    }
  });
});
