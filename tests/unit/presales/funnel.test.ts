/**
 * The presales conversion funnel aggregation.
 *
 * A stage counts bundles, not events — a guest who reloads the landing page
 * forty times is one bundle at landing_viewed. Medians are computed from the
 * FIRST occurrence of each stage per bundle, so replays cannot shrink the
 * journey time.
 */

import { describe, expect, it } from "vitest";

import { aggregateFunnel, FUNNEL_STAGES, type FunnelEventRow } from "@/lib/presales/funnel";

const at = (iso: string): Date => new Date(iso);

function row(bundleId: string | null, eventType: string, createdAt: string): FunnelEventRow {
  return { bundleId, eventType, createdAt: at(createdAt) };
}

describe("aggregateFunnel", () => {
  it("returns every stage with zero bundles for no events", () => {
    const funnel = aggregateFunnel([]);
    expect(funnel.stages.map((s) => s.stage)).toEqual([...FUNNEL_STAGES]);
    expect(funnel.stages.every((s) => s.bundles === 0)).toBe(true);
    expect(funnel.medianHoursToFirstView).toBeNull();
    expect(funnel.medianHoursToSignoff).toBeNull();
  });

  it("counts bundles per stage, not events", () => {
    const funnel = aggregateFunnel([
      row("b1", "bundle_sent", "2026-08-01T00:00:00Z"),
      row("b1", "landing_viewed", "2026-08-01T01:00:00Z"),
      row("b1", "landing_viewed", "2026-08-01T02:00:00Z"),
      row("b1", "landing_viewed", "2026-08-01T03:00:00Z"),
      row("b2", "bundle_sent", "2026-08-01T00:00:00Z"),
    ]);
    const byStage = Object.fromEntries(funnel.stages.map((s) => [s.stage, s.bundles]));
    expect(byStage["bundle_sent"]).toBe(2);
    expect(byStage["landing_viewed"]).toBe(1);
    expect(byStage["signoff_completed"]).toBe(0);
  });

  it("computes medians from the first occurrence per bundle", () => {
    const funnel = aggregateFunnel([
      // b1: sent at 00:00, first viewed 02:00 (the later replay must not matter)
      row("b1", "bundle_sent", "2026-08-01T00:00:00Z"),
      row("b1", "landing_viewed", "2026-08-01T02:00:00Z"),
      row("b1", "landing_viewed", "2026-08-02T00:00:00Z"),
      // b2: sent at 00:00, viewed 04:00, signed two days later
      row("b2", "bundle_sent", "2026-08-01T00:00:00Z"),
      row("b2", "landing_viewed", "2026-08-01T04:00:00Z"),
      row("b2", "signoff_completed", "2026-08-03T00:00:00Z"),
    ]);
    expect(funnel.medianHoursToFirstView).toBe(3); // median of [2, 4]
    expect(funnel.medianHoursToSignoff).toBe(48);
  });

  it("ignores a stage pair where the later stage precedes the earlier one", () => {
    // A landing_viewed BEFORE bundle_sent (draft preview) is not a journey.
    const funnel = aggregateFunnel([
      row("b1", "landing_viewed", "2026-08-01T00:00:00Z"),
      row("b1", "bundle_sent", "2026-08-01T06:00:00Z"),
    ]);
    expect(funnel.medianHoursToFirstView).toBeNull();
  });

  it("tallies drop-off signals as raw event counts", () => {
    const funnel = aggregateFunnel([
      row("b1", "otp_failed", "2026-08-01T00:00:00Z"),
      row("b1", "otp_failed", "2026-08-01T00:05:00Z"),
      row("b2", "session_expired", "2026-08-01T09:00:00Z"),
      row("b3", "bundle_revoked", "2026-08-01T10:00:00Z"),
      row(null, "bundle_expired_swept", "2026-08-01T11:00:00Z"),
    ]);
    expect(funnel.dropoff).toEqual({
      otpFailures: 2,
      expiredSessions: 1,
      revokedBundles: 1,
      expiredBundles: 1,
    });
  });

  it("drops events with no bundleId from stage counts", () => {
    const funnel = aggregateFunnel([row(null, "bundle_sent", "2026-08-01T00:00:00Z")]);
    const byStage = Object.fromEntries(funnel.stages.map((s) => [s.stage, s.bundles]));
    expect(byStage["bundle_sent"]).toBe(0);
  });
});
