import { describe, expect, it } from "vitest";

import { ledgerReadStatus } from "@/lib/ops/lane-check-sweep";
import { CHECK_TTL_MS, deriveLaneStatus } from "@/lib/coreedge/lanes";
import { LANE_PROOF_TTL_MS } from "@/lib/coreedge/freshness";

/**
 * The evidence path: a stored check becomes a lane status with an age.
 *
 * These assert the two ends of the join. The sweep's mapping is tested here
 * because a 403 and a 500 have different owners and must not collapse; the
 * derivation is tested against ledger-shaped facts because that is now where
 * a lane's green comes from.
 */

describe("ledgerReadStatus", () => {
  it("keeps a successful read", () => {
    expect(ledgerReadStatus("OK", 200)).toBe("OK");
  });

  it("keeps EMPTY — SAP answered and had nothing, which proves the path", () => {
    expect(ledgerReadStatus("EMPTY", 200)).toBe("EMPTY");
  });

  it("separates 403 from a generic error: different owner, different fix", () => {
    expect(ledgerReadStatus("ERROR", 403)).toBe("FORBIDDEN");
  });

  it("separates 401, which is the comm user's credentials", () => {
    expect(ledgerReadStatus("ERROR", 401)).toBe("UNAUTHORIZED");
  });

  it("does not invent a status for an unmapped failure", () => {
    expect(ledgerReadStatus("ERROR", 500)).toBe("ERROR");
  });

  it("maps NEEDS_SETUP to ERROR rather than carrying a second taxonomy", () => {
    expect(ledgerReadStatus("NEEDS_SETUP", null)).toBe("ERROR");
  });
});

describe("one TTL, not two", () => {
  it("the lane derivation and the freshness helper agree by construction", () => {
    expect(CHECK_TTL_MS).toBe(LANE_PROOF_TTL_MS);
  });
});

describe("a stored check becomes a lane status", () => {
  const now = new Date("2026-09-13T12:00:00Z");
  const healthy = {
    appRetired: false,
    key: { exists: true, revokedAt: null, expiresAt: null, isActive: true },
    access: { decision: "APPROVED" as const, expiresAt: null, revokedAt: null },
    binding: { matchingConnections: 1, secretUnreadable: false },
    now,
  };

  it("a fresh passing read renders Live", () => {
    const verdict = deriveLaneStatus({
      ...healthy,
      probe: { status: "OK", at: new Date(now.getTime() - 60_000) },
      read: { outcome: "OK", at: new Date(now.getTime() - 60_000), rows: 5 },
    });
    expect(verdict.status).toBe("live");
  });

  it("a read older than the TTL fades to unknown rather than keeping a stale green", () => {
    const stale = new Date(now.getTime() - CHECK_TTL_MS - 60_000);
    const verdict = deriveLaneStatus({
      ...healthy,
      probe: { status: "OK", at: stale },
      read: { outcome: "OK", at: stale, rows: 5 },
    });
    expect(verdict.status).toBe("unknown");
  });

  it("no ledger row at all is still unknown — never a guess", () => {
    const verdict = deriveLaneStatus({
      ...healthy,
      probe: { status: null, at: null },
      read: { outcome: null, at: null, rows: null },
    });
    expect(verdict.status).toBe("unknown");
  });

  it("a 0-row read is proof, not an error", () => {
    const verdict = deriveLaneStatus({
      ...healthy,
      probe: { status: "OK", at: new Date(now.getTime() - 60_000) },
      read: { outcome: "EMPTY", at: new Date(now.getTime() - 60_000), rows: 0 },
    });
    expect(verdict.status).not.toBe("sap-refused");
  });
});
