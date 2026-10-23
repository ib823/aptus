/**
 * Studio's connection health chip reads every status the probe writers record
 * (P0.2, A50).
 *
 * The probe sweep and "Probe now" record UNREADABLE when a connection's stored
 * secret will not open. Studio's mapping had no case for it, so it fell to the
 * default and the chip said "Not checked" about a connection that was checked
 * and found unopenable — while the broker refuses every call through it.
 *
 * And an OK is only "Reachable" while it is recent (P0.2 review round 4).
 * Operations, the topology lens and the SAP systems screen all read an OK
 * older than CONNECTION_PROOF_TTL_MS as stale, through connectionHealthVerdict;
 * this screen — the one a builder opens to decide whether a connection works —
 * mapped the status alone and kept the green "Reachable" chip for an OK from
 * months ago: "it worked once", the reading P0.2 removed everywhere else.
 */

import { describe, expect, it } from "vitest";

import { connectionHealthChip, healthToStatus, unreadableHint } from "@/components/studio/ConnectionsClient";
import {
  CONNECTION_GROUP_UNREADABLE_STATUS,
  CONNECTION_PROOF_TTL_MS,
  CONNECTION_UNREADABLE_STATUS,
  connectionHealthVerdict,
} from "@/lib/coreedge/freshness";

const NOW = new Date("2026-10-21T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** A connection as the page serialises it to this screen. */
const conn = (lastValidationStatus: string | null, lastValidatedAt: string | null = ago(MINUTE)) => ({
  lastValidationStatus,
  lastValidatedAt,
});

describe("Studio connection health", () => {
  it("draws an unopenable secret as needing setup, never as not checked", () => {
    expect(healthToStatus(conn(CONNECTION_UNREADABLE_STATUS), NOW)).toBe("NEEDS_SETUP");
  });

  it("says WHICH secret will not open, so a sibling whose secret is fine is not re-saved (P0.2 review)", () => {
    expect(healthToStatus(conn(CONNECTION_GROUP_UNREADABLE_STATUS), NOW)).toBe("NEEDS_SETUP");
    expect(unreadableHint(CONNECTION_UNREADABLE_STATUS)).toMatch(/re-save this connection's secrets/);
    expect(unreadableHint(CONNECTION_GROUP_UNREADABLE_STATUS)).toMatch(/another connection for this product will not/);
    expect(unreadableHint(CONNECTION_GROUP_UNREADABLE_STATUS)).not.toMatch(/this connection's secrets/);
    expect(unreadableHint("OK")).toBeNull();
    expect(unreadableHint(null)).toBeNull();
  });

  it("keeps 'not checked' for a connection nobody has probed", () => {
    expect(healthToStatus(conn(null, null), NOW)).toBe("NOT_CHECKED");
    expect(connectionHealthChip(conn(null, null), NOW).label).toBeUndefined();
  });

  it("names every status a probe writer records", () => {
    // The probe outcomes, plus the one the sweep records without reaching SAP.
    for (const status of ["OK", "UNAUTHORIZED", "NOT_FOUND", "TIMEOUT", "ERROR", "NO_PROBE_PATH", "UNREADABLE", "GROUP_UNREADABLE"]) {
      expect(healthToStatus(conn(status), NOW), status).not.toBe("NOT_CHECKED");
    }
  });
});

describe("an OK is Reachable only while it is recent (P0.2 review round 4)", () => {
  it("a recent OK is Reachable", () => {
    const c = conn("OK", ago(MINUTE));
    expect(healthToStatus(c, NOW)).toBe("ACTIVATED");
    expect(connectionHealthChip(c, NOW)).toMatchObject({ status: "ACTIVATED", label: "Reachable" });
  });

  it("an OK older than the proof TTL is never ACTIVATED or 'Reachable'", () => {
    for (const age of [CONNECTION_PROOF_TTL_MS + MINUTE, 90 * DAY]) {
      const at = ago(age);
      const c = conn("OK", at);
      expect(connectionHealthVerdict({ lastValidationStatus: "OK", lastValidatedAt: new Date(at) }, NOW)).toBe("stale");
      expect(healthToStatus(c, NOW)).not.toBe("ACTIVATED");
      const chip = connectionHealthChip(c, NOW);
      expect(chip.status).not.toBe("ACTIVATED");
      expect(chip.label).not.toBe("Reachable");
      // Said in the words Operations and the SAP systems screen use for the same row.
      expect(chip.label).toBe("OK · stale");
      expect(chip.meaning).toMatch(/aged/);
      expect(chip.meaning).not.toMatch(/not yet probed/);
    }
  });

  it("an OK with no success time is stale, not Reachable", () => {
    expect(connectionHealthChip(conn("OK", null), NOW)).toMatchObject({ status: "NOT_CHECKED", label: "OK · stale" });
  });

  it("agrees with connectionHealthVerdict at the TTL boundary, both sides", () => {
    expect(healthToStatus(conn("OK", ago(CONNECTION_PROOF_TTL_MS)), NOW)).toBe("ACTIVATED");
    expect(healthToStatus(conn("OK", ago(CONNECTION_PROOF_TTL_MS + 1)), NOW)).not.toBe("ACTIVATED");
  });

  it("an aged failure keeps its own status: age does not soften a refusal", () => {
    expect(healthToStatus(conn("UNAUTHORIZED", ago(90 * DAY)), NOW)).toBe("NEEDS_SETUP");
    expect(healthToStatus(conn("TIMEOUT", null), NOW)).toBe("PROBE_FAILED");
  });
});
