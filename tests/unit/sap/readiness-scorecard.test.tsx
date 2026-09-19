/**
 * The readiness scorecard: pills that cannot collide, and an instruction that
 * is not addressed to someone who cannot follow it.
 *
 * BOTH DEFECTS WERE VISIBLE IN PRODUCTION on /studio/discover and neither was
 * caught by a test, because both are about what the reader SEES rather than
 * what the component is handed.
 *
 *   1. `CountPill` was `flex items-center justify-between` with no `gap`.
 *      `justify-between` separates two children only while there is slack
 *      between them; once label plus number fill the box that separation is
 *      zero and they touch. Nine columns on a wide screen gave each pill about
 *      140px, so the longest labels beside the largest numbers rendered as
 *      "Available147" and "Reference2,527" while "Authorized 0" looked fine —
 *      it degraded exactly on the biggest numbers, on a card whose whole
 *      argument is that every number traces to a probe.
 *
 *   2. The headline read "(not probed yet — run “Probe all”)" to EVERYONE,
 *      while the Probe all button renders only inside `{data?.isAdmin && …}`.
 *      A consultant was told to press a control that is not on their page.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReadinessScorecard, readinessPercent } from "@/components/sap/capability/ReadinessScorecard";

/** The zero state the Discover screen actually showed, with real counts. */
const NOTHING_PROBED = {
  activated: 0,
  dataConfirmed: 0,
  dataProbe: false,
  needsSetup: 0,
  notFound: 0,
  notChecked: 606,
  probeFailed: 0,
  notProbeable: 382,
  available: 147,
  probed: 0,
  probeable: 606,
  apiTotal: 3662,
  reference: 2527,
  deprecated: 0,
  totalItems: 17934,
  aiApis: 0,
  lastProbedAt: null,
} as const;

function pillFor(label: string): HTMLElement {
  const node = screen.getByText(label).parentElement;
  if (node === null) throw new Error(`no pill wrapper for "${label}"`);
  return node;
}

describe("a pill's label can never touch its number", () => {
  it("puts a real gap between them rather than relying on justify-between", () => {
    /*
     * The assertion is on the CLASS rather than on rendered geometry: jsdom
     * does not lay out, so a width-based test here would pass against the
     * broken code. `gap` is a floor that holds at every width; the absence of
     * one is precisely what produced "Available147".
     */
    render(<ReadinessScorecard {...NOTHING_PROBED} />);
    for (const label of ["Available", "Reference", "Not probeable", "Authorized"]) {
      expect(pillFor(label).className, `${label} pill`).toMatch(/\bgap-\d/);
    }
  });

  it("keeps a two-word label on one line, so the row is not ragged", () => {
    // "Needs setup", "Not checked" and "Not probeable" wrapped where the
    // one-word labels did not, leaving nine pills at two different heights.
    render(<ReadinessScorecard {...NOTHING_PROBED} />);
    for (const label of ["Needs setup", "Not checked", "Not probeable"]) {
      expect(screen.getByText(label).className, `${label} label`).toContain("whitespace-nowrap");
    }
  });

  it("takes a squeeze out of the label, never out of the number", () => {
    render(<ReadinessScorecard {...NOTHING_PROBED} />);
    const value = screen.getByText("2,527");
    expect(value.className).toContain("shrink-0");
  });

  it("still renders all nine buckets and their counts", () => {
    // The fix must not have dropped one: a silently missing bucket on this
    // card is worse than a cramped one.
    render(<ReadinessScorecard {...NOTHING_PROBED} />);
    for (const label of [
      "Authorized",
      "Needs setup",
      "Available",
      "Not found",
      "Not checked",
      "Probe failed",
      "Not probeable",
      "Reference",
      "Deprecated",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("147")).toBeTruthy();
    expect(screen.getByText("2,527")).toBeTruthy();
  });
});

describe("the reason a readiness of zero is explained to the right person", () => {
  it("tells an admin to run Probe all", () => {
    render(<ReadinessScorecard {...NOTHING_PROBED} canProbe />);
    expect(screen.getByText(/run “Probe all”/)).toBeTruthy();
  });

  it("does NOT tell a consultant to press a button they cannot see", () => {
    /*
     * The button lives inside `{data?.isAdmin && …}`. Telling someone to press
     * an absent control leaves them concluding the product is broken rather
     * than that the action belongs to someone else.
     */
    render(<ReadinessScorecard {...NOTHING_PROBED} canProbe={false} />);
    expect(screen.queryByText(/run “Probe all”/)).toBeNull();
    expect(screen.getByText(/a platform admin runs “Probe all”/)).toBeTruthy();
  });

  it("says nothing about probing once a probe has actually run", () => {
    // Neither sentence belongs on a card that has a stored result.
    render(<ReadinessScorecard {...NOTHING_PROBED} probed={606} activated={12} canProbe={false} />);
    expect(screen.queryByText(/Probe all/)).toBeNull();
  });

  it("defaults to the admin sentence, so existing callers are unchanged", () => {
    // The SAP Operations explorer passes no flag and must keep its wording.
    render(<ReadinessScorecard {...NOTHING_PROBED} />);
    expect(screen.getByText(/run “Probe all”/)).toBeTruthy();
  });
});

describe("readinessPercent", () => {
  it("is 0 when nothing was probed, rather than NaN", () => {
    expect(readinessPercent(0, 0)).toBe(0);
  });

  it("rounds a real sample", () => {
    expect(readinessPercent(12, 606)).toBe(2);
  });
});
