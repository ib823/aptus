import { describe, expect, it } from "vitest";

import {
  KEY_IDLE_MS,
  contestedEnvironments,
  isProvenRead,
  keySuggestion,
} from "@/lib/coreedge/queries";

/**
 * The three derivations behind PR-6's screens, tested away from the database.
 *
 * These are the judgements: which reads count as proof, which environments are
 * contested, and what an operator is invited to consider about a key. Getting
 * any of them wrong produces a screen that is confidently incorrect, which is
 * the failure mode this product exists to avoid.
 */

describe("isProvenRead", () => {
  it("counts a read that returned", () => {
    expect(isProvenRead("OK")).toBe(true);
  });

  it("counts EMPTY — SAP answered and had nothing to return", () => {
    expect(isProvenRead("EMPTY")).toBe(true);
  });

  it.each(["FORBIDDEN", "NOT_FOUND", "TIMEOUT", "ERROR"])(
    "does not count %s as proof the feed is readable",
    (status) => {
      expect(isProvenRead(status)).toBe(false);
    },
  );

  it("does not count a read that never happened", () => {
    expect(isProvenRead(null)).toBe(false);
  });
});

describe("contestedEnvironments", () => {
  it("finds an environment two active systems both claim", () => {
    const contested = contestedEnvironments([
      { environment: "TEST", isActive: true },
      { environment: "TEST", isActive: true },
      { environment: "DEV", isActive: true },
    ]);
    expect([...contested]).toEqual(["TEST"]);
  });

  it("does not contest when only one active system claims it", () => {
    expect([...contestedEnvironments([{ environment: "TEST", isActive: true }])]).toEqual([]);
  });

  it("a deactivated system has dropped its claim — the documented way out", () => {
    const contested = contestedEnvironments([
      { environment: "TEST", isActive: true },
      { environment: "TEST", isActive: false },
    ]);
    expect([...contested]).toEqual([]);
  });

  it("ignores an environment nobody can name rather than inventing a conflict", () => {
    const contested = contestedEnvironments([
      { environment: "staging-2", isActive: true },
      { environment: "staging-2", isActive: true },
      { environment: null, isActive: true },
    ]);
    expect([...contested]).toEqual([]);
  });
});

describe("keySuggestion", () => {
  const now = new Date("2026-09-12T12:00:00Z");

  it("says nothing depends on a key that was never used", () => {
    expect(keySuggestion({ revokedAt: null, lastUsedAt: null }, now)).toMatch(/never used/i);
  });

  it("asks before revoking one idle past 30 days", () => {
    const idle = new Date(now.getTime() - KEY_IDLE_MS - 1000);
    expect(keySuggestion({ revokedAt: null, lastUsedAt: idle }, now)).toMatch(/ask the owner/i);
  });

  it("keeps one used within 30 days", () => {
    const recent = new Date(now.getTime() - KEY_IDLE_MS + 1000);
    expect(keySuggestion({ revokedAt: null, lastUsedAt: recent }, now)).toMatch(/active use/i);
  });

  it("is exactly at the boundary, not approximately", () => {
    const exactly = new Date(now.getTime() - KEY_IDLE_MS);
    // 30 days to the millisecond is not yet "more than 30 days".
    expect(keySuggestion({ revokedAt: null, lastUsedAt: exactly }, now)).toMatch(/active use/i);
  });

  it("a revoked key is reported as revoked, whatever its traffic said", () => {
    expect(
      keySuggestion({ revokedAt: new Date("2026-09-01T00:00:00Z"), lastUsedAt: null }, now),
    ).toBe("Revoked");
  });

  it("never suggests revoking on its own — nothing expires by itself", () => {
    const idle = new Date(now.getTime() - KEY_IDLE_MS - 1000);
    const suggestion = keySuggestion({ revokedAt: null, lastUsedAt: idle }, now);
    expect(suggestion).not.toMatch(/^revoke\b/i);
  });
});
