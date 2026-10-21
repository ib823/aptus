/**
 * Studio's connection health chip reads every status the probe writers record
 * (P0.2, A50).
 *
 * The probe sweep and "Probe now" record UNREADABLE when a connection's stored
 * secret will not open. Studio's mapping had no case for it, so it fell to the
 * default and the chip said "Not checked" about a connection that was checked
 * and found unopenable — while the broker refuses every call through it.
 */

import { describe, expect, it } from "vitest";

import { healthToStatus, unreadableHint } from "@/components/studio/ConnectionsClient";
import { CONNECTION_GROUP_UNREADABLE_STATUS, CONNECTION_UNREADABLE_STATUS } from "@/lib/coreedge/freshness";

describe("Studio connection health", () => {
  it("draws an unopenable secret as needing setup, never as not checked", () => {
    expect(healthToStatus(CONNECTION_UNREADABLE_STATUS)).toBe("NEEDS_SETUP");
  });

  it("says WHICH secret will not open, so a sibling whose secret is fine is not re-saved (P0.2 review)", () => {
    expect(healthToStatus(CONNECTION_GROUP_UNREADABLE_STATUS)).toBe("NEEDS_SETUP");
    expect(unreadableHint(CONNECTION_UNREADABLE_STATUS)).toMatch(/re-save this connection's secrets/);
    expect(unreadableHint(CONNECTION_GROUP_UNREADABLE_STATUS)).toMatch(/another connection for this product will not/);
    expect(unreadableHint(CONNECTION_GROUP_UNREADABLE_STATUS)).not.toMatch(/this connection's secrets/);
    expect(unreadableHint("OK")).toBeNull();
    expect(unreadableHint(null)).toBeNull();
  });

  it("keeps 'not checked' for a connection nobody has probed", () => {
    expect(healthToStatus(null)).toBe("NOT_CHECKED");
  });

  it("names every status a probe writer records", () => {
    // The probe outcomes, plus the one the sweep records without reaching SAP.
    for (const status of ["OK", "UNAUTHORIZED", "NOT_FOUND", "TIMEOUT", "ERROR", "NO_PROBE_PATH", "UNREADABLE", "GROUP_UNREADABLE"]) {
      expect(healthToStatus(status), status).not.toBe("NOT_CHECKED");
    }
  });
});
