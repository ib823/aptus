/**
 * Seed gate — the one way an e2e test may skip for missing data.
 *
 * ~40 assertions across six spec files self-skip when their seed entity is
 * absent (`test.skip(true, '… — seed required')`). Playwright reports those
 * as "skipped", which nobody reads, so a run against an unseeded database is
 * GREEN while asserting nothing — silence impersonating coverage. The repo's
 * own latent-gap sweep flagged this as its highest-risk test finding.
 *
 * This helper keeps the skip honest and gives it an off-switch:
 *
 *   - Default: skip, exactly as before — local runs against a bare DB stay
 *     usable, and the skip reason still names the missing entity.
 *   - REQUIRE_SEED=1: the same absence is a FAILURE. Set it in any run whose
 *     purpose is those journeys (a seeded CI job, a release check), so "the
 *     suite passed" can only mean "the suite ran".
 *
 * A unit sweep (tests/unit/e2e-hygiene/seed-gate.test.ts) forbids new raw
 * `test.skip(true, …)` calls, so data-absence skips cannot silently bypass
 * the gate again.
 */

import { test } from "@playwright/test";

export function seedGate(missing: string): void {
  if (process.env.REQUIRE_SEED === "1") {
    throw new Error(
      `REQUIRE_SEED=1 but ${missing}. This run promises seeded data — ` +
        `seed the database (or drop REQUIRE_SEED) instead of skipping.`,
    );
  }
  test.skip(true, `${missing} — seed required`);
}
