/**
 * The time-to-first-call tiles (P2.12): both boards show the targets beside
 * the figures, judge only with enough journeys, and say "at least" where open
 * journeys could still raise a figure.
 *
 * Contrast in light and dark is measured on rendered pixels by the axe scans
 * (tests/e2e/accessibility.coreedge.auth.spec.ts: the design-system page
 * renders these tiles, and /control-tower/journey is scanned in both themes);
 * this file checks what the tiles say and that they use only theme-aware
 * tokens.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { JourneyClient } from "@/components/control-tower/JourneyClient";
import { JourneyTiles } from "@/app/(coreedge)/coreedge/operations/JourneyTiles";
import { summarizeJourneys, type JourneyEventRow } from "@/lib/coreedge/journey-metrics";

const NOW = new Date("2026-10-21T12:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ev(organizationId: string, kind: string, at: number, extra: Partial<JourneyEventRow> = {}): JourneyEventRow {
  return {
    organizationId,
    kind,
    scopeKey: kind,
    solutionId: null,
    environment: null,
    subjectId: null,
    detail: null,
    at: new Date(at),
    ...extra,
  };
}

/** Eleven sign-ups that called within 20 minutes; one app still waiting on an approver. */
const EVENTS: JourneyEventRow[] = [
  ...Array.from({ length: 11 }, (_, i) => [
    ev(`w${i}`, "WORKSPACE_CREATED", NOW.getTime() - (i + 1) * DAY),
    ev(`w${i}`, "FIRST_CALL", NOW.getTime() - (i + 1) * DAY + 20 * MINUTE, { environment: "SANDBOX", detail: "console" }),
  ]).flat(),
  ev("acme", "GRANT_REQUESTED", NOW.getTime() - 3 * HOUR, { solutionId: "app", environment: "DEV", subjectId: "g" }),
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the CoreEdge board's tiles", () => {
  it("shows each median with its target and verdict", () => {
    render(<JourneyTiles summary={summarizeJourneys(EVENTS, NOW)} />);

    const ttfc = screen.getByRole("article", { name: "Time to first call" });
    expect(within(ttfc).getByText("Target: median 30 minutes or less (60 for ABAP on-premise).", { exact: false })).toBeTruthy();
    expect(within(ttfc).getAllByText("20 min").length).toBeGreaterThan(0);
    expect(within(ttfc).getByText("Meets the target")).toBeTruthy();

    const ttfrc = screen.getByRole("article", { name: "Time to first real call" });
    expect(within(ttfrc).getByText(/Target: median 1 business day or less/)).toBeTruthy();
    // The one journey is open, so its figure is a floor and it is not judged.
    expect(within(ttfrc).getAllByText("at least 3 h").length).toBeGreaterThan(0);
    expect(within(ttfrc).getByText("Too few to judge: 1 of 10 journeys")).toBeTruthy();
    expect(within(ttfrc).getByText(/1 waiting on an approver, 0 on SAP set-up, 0 on the developer/)).toBeTruthy();
    for (const part of ["Approver wait", "SAP set-up wait", "Developer time"]) {
      expect(within(ttfrc).getByText(part)).toBeTruthy();
    }

    const funnel = screen.getByRole("article", { name: "Milestones reached" });
    expect(within(funnel).getByText("Signed up for a developer workspace")).toBeTruthy();
  });

  it("uses only the console's theme-aware tokens: no raw colour, no dark: override needed", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/app/(coreedge)/coreedge/operations/JourneyTiles.tsx"), "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(|\b(?:bg|text)-(?:red|green|amber|yellow|blue|gray|slate)-\d/);
    expect(source).toMatch(/bg-gate-ok-bg text-gate-ok-fg/);
  });
});

describe("Control Tower's screen", () => {
  it("renders the same figures and targets from its endpoint", async () => {
    const summary = summarizeJourneys(EVENTS, NOW);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: { scope: "global", ...summary } })),
    );
    render(<JourneyClient />);

    expect(await screen.findByRole("heading", { name: "Time to first real call" })).toBeTruthy();
    expect(screen.getByText(/Target: median 30 minutes or less/)).toBeTruthy();
    expect(screen.getByText(/Target: median 1 business day or less/)).toBeTruthy();
    expect(screen.getByText("Meets the target")).toBeTruthy();
    expect(screen.getByText(/Every organization is included/)).toBeTruthy();
  });

  it("says when the endpoint could not be read, and never shows that as no journeys", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "Control Tower is role-gated." } }, { status: 403 })),
    );
    render(<JourneyClient />);
    expect(await screen.findByText("Time to first call could not be read")).toBeTruthy();
    expect(screen.queryByText("No journeys yet")).toBeNull();
  });
});
