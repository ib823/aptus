/**
 * The Operations Center can widen its window.
 *
 * Broker traffic, Incidents, the Write ledger and Throttle were all hard-wired
 * to the last 24 hours. Not by policy — every one of those endpoints already
 * accepted `?hours=` and clamped it through `opsWindowHours` — the screens
 * simply never sent one. So "was this happening last week?" was unanswerable on
 * a monitoring console, which is the question such a console exists for.
 *
 * These pin the clamp (the server's contract) and the offered windows (the
 * client's), because the two have to agree: an option the server would reject
 * is a control that silently does nothing.
 */

import { describe, expect, it } from "vitest";

import { opsWindowHours } from "@/lib/ops/guard";
import { DEFAULT_OPS_WINDOW_HOURS, OPS_WINDOWS } from "@/components/ops/useOpsFeed";

describe("opsWindowHours clamps whatever arrives", () => {
  it("falls back to 24 hours when absent or unparseable", () => {
    expect(opsWindowHours(null)).toBe(24);
    expect(opsWindowHours("")).toBe(24);
    expect(opsWindowHours("not a number")).toBe(24);
  });

  it("refuses zero and negatives rather than producing an empty window", () => {
    expect(opsWindowHours("0")).toBe(24);
    expect(opsWindowHours("-5")).toBe(24);
  });

  it("caps at 30 days, so one request cannot scan the whole audit table", () => {
    expect(opsWindowHours("100000")).toBe(24 * 30);
  });

  it("passes a legitimate window through untouched", () => {
    expect(opsWindowHours("168")).toBe(168);
  });
});

describe("the offered windows are all windows the server will honour", () => {
  it("every option survives the clamp unchanged", () => {
    /*
     * The failure this prevents: offering "90 days" in the picker while the
     * server caps at 30. The control would appear to work, the data would be
     * 30 days, and nothing on the screen would say so.
     */
    for (const w of OPS_WINDOWS) {
      expect(opsWindowHours(String(w.hours)), w.label).toBe(w.hours);
    }
  });

  it("offers more than one window, or the control is decoration", () => {
    expect(OPS_WINDOWS.length).toBeGreaterThan(1);
  });

  it("defaults to the same 24 hours the server does", () => {
    // If these drifted apart, the picker would open showing one window while
    // the feed had already loaded another.
    expect(DEFAULT_OPS_WINDOW_HOURS).toBe(opsWindowHours(null));
  });

  it("labels are distinct, so two options cannot look like the same choice", () => {
    const labels = OPS_WINDOWS.map((w) => w.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
