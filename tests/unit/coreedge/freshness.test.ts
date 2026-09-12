/**
 * The TTL that was never written (PR-5, capability 5).
 *
 * The audit found the prober present and the COMPARISON missing: "no code
 * compares lastValidatedAt against a maximum age and no status decays to stale
 * or unknown". So a connection probed once in March still read green in
 * September, and green meant "it worked once" rather than "it worked recently".
 *
 * These assertions are about the distinctions the comparison has to preserve.
 * Getting the arithmetic right is easy; the value is in never collapsing
 * "never looked" into "looked a while ago", or a stale check into a failure.
 */

import { describe, expect, it } from "vitest";

import {
  CATALOGUE_BADGE_TTL_MS,
  LANE_PROOF_TTL_MS,
  describeAge,
  freshnessOf,
  laneProofIsFresh,
  stalenessReason,
} from "@/lib/coreedge/freshness";

const NOW = new Date("2026-09-12T12:00:00Z");
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("the 24-hour rule", () => {
  it("matches the vocabulary's own definition of Unknown", () => {
    // "No check within 24 h. A claim about us, not the lane."
    expect(LANE_PROOF_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("holds a check fresh right up to the boundary and not past it", () => {
    expect(laneProofIsFresh(ago(DAY - MINUTE), NOW)).toBe(true);
    expect(laneProofIsFresh(ago(DAY), NOW)).toBe(true);
    expect(laneProofIsFresh(ago(DAY + MINUTE), NOW)).toBe(false);
  });

  it("expires catalogue badges on a different, longer clock", () => {
    expect(CATALOGUE_BADGE_TTL_MS).toBe(7 * DAY);
    expect(CATALOGUE_BADGE_TTL_MS).toBeGreaterThan(LANE_PROOF_TTL_MS);
  });
});

describe("'never looked' and 'looked a while ago' are different answers", () => {
  it("distinguishes them", () => {
    /*
     * Collapsing these is how a brand-new connection looks like a neglected
     * one — and how an operator chasing stale checks wastes a morning on
     * something nobody has ever probed.
     */
    expect(freshnessOf(null, LANE_PROOF_TTL_MS, NOW)).toBe("never");
    expect(freshnessOf(ago(2 * DAY), LANE_PROOF_TTL_MS, NOW)).toBe("stale");
    expect(freshnessOf(ago(MINUTE), LANE_PROOF_TTL_MS, NOW)).toBe("fresh");
  });

  it("treats undefined like null rather than like a date", () => {
    expect(freshnessOf(undefined, LANE_PROOF_TTL_MS, NOW)).toBe("never");
  });

  it("gives each its own sentence", () => {
    const never = stalenessReason(null, LANE_PROOF_TTL_MS, NOW);
    const stale = stalenessReason(ago(3 * DAY), LANE_PROOF_TTL_MS, NOW);
    expect(never).not.toBe(stale);
    // Match the claim, not a particular word: the "never" sentence has to say
    // no check has run, and the stale one has to carry the measured age.
    expect(never).toMatch(/never|has ever run/i);
    expect(stale).toContain("3 d ago");
  });

  it("says the absence is OURS, so nobody wakes the wrong team", () => {
    // An operator who reads Unknown as "SAP is down" goes and wakes the client's
    // Basis team over a cron that did not run.
    expect(stalenessReason(null, LANE_PROOF_TTL_MS, NOW)).toContain("says nothing about SAP");
  });

  it("has nothing to say about a fresh check", () => {
    expect(stalenessReason(ago(MINUTE), LANE_PROOF_TTL_MS, NOW)).toBeNull();
  });
});

describe("ages are real", () => {
  it("counts in the unit a person would use", () => {
    expect(describeAge(ago(2 * MINUTE), NOW)).toBe("2 m ago");
    expect(describeAge(ago(4 * HOUR), NOW)).toBe("4 h ago");
    expect(describeAge(ago(12 * DAY), NOW)).toBe("12 d ago");
  });

  it("has no 'just now' shortcut", () => {
    /*
     * A claim that something was proven "just now" when it was proven fifty
     * seconds ago is a small lie in the one place this product cannot afford
     * one: every status is rendered with an age, and the board's honesty rests
     * on the age being real.
     */
    expect(describeAge(ago(50_000), NOW)).toBe("0 m ago");
    expect(describeAge(ago(50_000), NOW)).not.toMatch(/just now/i);
  });

  it("reports a future timestamp as clock skew rather than inventing a number", () => {
    // "in 3 minutes" is absurd and "0 m ago" is a guess. A disagreement between
    // clocks is a real condition and gets said.
    expect(describeAge(new Date(NOW.getTime() + 3 * MINUTE), NOW)).toBe("clock skew");
  });

  it("returns null when there is no timestamp, rather than a placeholder", () => {
    // null means "render no age"; a string like "unknown" would be rendered
    // beside a chip as though it were a measurement.
    expect(describeAge(null, NOW)).toBeNull();
  });
});
