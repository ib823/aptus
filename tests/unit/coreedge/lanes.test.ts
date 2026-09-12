/**
 * Lane derivation (PR-4).
 *
 * THE PROPERTY THAT MATTERS MOST is not that Live works — it is that Live is
 * hard to reach. The lane model exists because the old console called a lane
 * healthy when a metadata probe returned 200, and metadata answering says
 * nothing about whether a read will be permitted: a 403 on the entity set is the
 * single most common failure in this system. So the assertions below spend most
 * of their effort on the ways a lane must REFUSE to claim Live.
 *
 * The derivation is a pure function over plain facts, not over Prisma rows,
 * which is what makes it drivable through all eighteen statuses without a
 * database.
 */

import { describe, expect, it } from "vitest";

import {
  CHECK_TTL_MS,
  ENVIRONMENT_LABELS,
  LANE_ENVIRONMENTS,
  deriveLaneStatus,
  notStartedVerdict,
  parseLaneEnvironment,
  type LaneFacts,
} from "@/lib/coreedge/lanes";
import { LANE_STATUSES, LANE_STATUS_VOCABULARY } from "@/lib/coreedge/status-vocabulary";

const NOW = new Date("2026-09-12T12:00:00Z");
const RECENT = new Date(NOW.getTime() - 60_000);
const ANCIENT = new Date(NOW.getTime() - CHECK_TTL_MS - 60_000);

/** A lane where every hop proves. Each test spoils exactly one thing. */
function healthy(): LaneFacts {
  return {
    appRetired: false,
    key: { exists: true, isActive: true, revokedAt: null, expiresAt: null },
    access: { decision: "APPROVED", expiresAt: null, revokedAt: null },
    binding: { matchingConnections: 1, secretUnreadable: false },
    probe: { status: "OK", at: RECENT },
    read: { outcome: "OK", at: RECENT, rows: 5 },
    now: NOW,
  };
}

function withFacts(patch: Partial<LaneFacts>): LaneFacts {
  return { ...healthy(), ...patch };
}

describe("environments are parsed, never compared raw", () => {
  it("folds the spellings the columns actually contain", () => {
    // These are free-text columns written by different code paths over time.
    // "prod" and "PROD" being two environments is how a lane matches nothing.
    expect(parseLaneEnvironment("prod")).toBe("PROD");
    expect(parseLaneEnvironment("  QAS ")).toBe("TEST");
    expect(parseLaneEnvironment("Production")).toBe("PROD");
    expect(parseLaneEnvironment("SBX")).toBe("SANDBOX");
  });

  it("returns null rather than guessing at an unknown one", () => {
    // An environment nobody can name is not a lane; rendering it as one puts a
    // chip on a row whose identity we do not know.
    expect(parseLaneEnvironment("STAGING")).toBeNull();
    expect(parseLaneEnvironment("")).toBeNull();
    expect(parseLaneEnvironment(null)).toBeNull();
    expect(parseLaneEnvironment(undefined)).toBeNull();
  });

  it("labels every environment it admits", () => {
    for (const env of LANE_ENVIRONMENTS) {
      expect(ENVIRONMENT_LABELS[env]).toBeTruthy();
    }
  });
});

describe("Live is hard to reach", () => {
  it("is reached when every hop proves", () => {
    const v = deriveLaneStatus(healthy());
    expect(v.status).toBe("live");
    expect(v.brokenHop).toBeNull();
    expect(v.checkedAt).toEqual(RECENT);
  });

  it("is NOT reached when metadata is green but no read has ever been proven", () => {
    /*
     * The single most important assertion in this file. "Reachable" and
     * "readable" are different claims, and the old console conflated them.
     */
    const v = deriveLaneStatus(withFacts({ read: { outcome: null, at: null, rows: null } }));
    expect(v.status).toBe("unknown");
    expect(v.because).toContain("Reachable is not the same as readable");
  });

  it("is NOT reached when the last proven read has gone stale", () => {
    const v = deriveLaneStatus(withFacts({ read: { outcome: "OK", at: ANCIENT, rows: 5 } }));
    expect(v.status).toBe("unknown");
  });

  it("is NOT reached when the probe itself has gone stale", () => {
    const v = deriveLaneStatus(withFacts({ probe: { status: "OK", at: ANCIENT } }));
    expect(v.status).toBe("unknown");
  });

  it("is NOT reached when nothing has ever been checked", () => {
    const v = deriveLaneStatus(
      withFacts({ probe: { status: null, at: null }, read: { outcome: null, at: null, rows: null } }),
    );
    expect(v.status).toBe("unknown");
    // The sentence has to say that no evidence exists, not merely that the
    // lane is unknown — "Unknown" is a claim about us, and this explains it.
    expect(v.because).toMatch(/never|has ever/i);
  });
});

describe("an empty read is a success, not a failure", () => {
  it("is No data, on the one gate-info token", () => {
    const v = deriveLaneStatus(withFacts({ read: { outcome: "EMPTY", at: RECENT, rows: 0 } }));
    expect(v.status).toBe("noData");
    expect(v.brokenHop).toBeNull();
    expect(LANE_STATUS_VOCABULARY.noData.token).toBe("gate-info");
    expect(v.because).toContain("success");
  });
});

describe("the first failing hop decides, and nothing below it is consulted", () => {
  it("reports the key, not the binding, when both are broken", () => {
    /*
     * A lane with no key AND no SAP system is one problem for the app owner,
     * not two. Reporting the later hop as well would blame the platform admin
     * for a call that never left the building.
     */
    const v = deriveLaneStatus(
      withFacts({
        key: { exists: false, isActive: false, revokedAt: null, expiresAt: null },
        binding: { matchingConnections: 0, secretUnreadable: false },
      }),
    );
    expect(v.status).toBe("noKey");
    expect(v.brokenHop).toBe("key");
  });

  it("reports access before key, because there is nothing to collect yet", () => {
    /*
     * Access is checked before Key even though Key is the first hop a CALL
     * travels: "No key" means access is approved and none was collected, so
     * showing it to someone with no approval sends them to fetch something they
     * cannot be given.
     */
    const v = deriveLaneStatus(
      withFacts({
        access: { decision: null, expiresAt: null, revokedAt: null },
        key: { exists: false, isActive: false, revokedAt: null, expiresAt: null },
      }),
    );
    expect(v.status).toBe("noAccess");
    expect(v.brokenHop).toBe("access");
  });
});

describe("access states map to the statuses that differ in what to do next", () => {
  it("distinguishes expiry from revocation, because one renews and one does not", () => {
    const expired = deriveLaneStatus(
      withFacts({ access: { decision: "APPROVED", expiresAt: ANCIENT, revokedAt: null } }),
    );
    expect(expired.status).toBe("accessEnded");
    expect(expired.because).toContain("renewing keeps it");

    const revoked = deriveLaneStatus(
      withFacts({ access: { decision: "REVOKED", expiresAt: null, revokedAt: RECENT } }),
    );
    expect(revoked.status).toBe("noAccess");
    expect(revoked.because).toContain("nothing to renew");
  });

  it("shows a pending request as In review", () => {
    expect(
      deriveLaneStatus(withFacts({ access: { decision: "REQUESTED", expiresAt: null, revokedAt: null } }))
        .status,
    ).toBe("inReview");
  });

  it("treats a declined request as No access", () => {
    expect(
      deriveLaneStatus(withFacts({ access: { decision: "REJECTED", expiresAt: null, revokedAt: null } }))
        .status,
    ).toBe("noAccess");
  });

  it("lets SANDBOX_ONLY and READ_ONLY clear the access hop (D2)", () => {
    // Historical rows keep meaning what they meant; they are never offered again.
    for (const decision of ["SANDBOX_ONLY", "READ_ONLY"] as const) {
      expect(deriveLaneStatus(withFacts({ access: { decision, expiresAt: null, revokedAt: null } })).status).toBe(
        "live",
      );
    }
  });
});

describe("key states", () => {
  it("separates 'none collected' from 'not valid'", () => {
    // Different words because different actions: collect, versus find out why
    // it stopped working.
    expect(
      deriveLaneStatus(
        withFacts({ key: { exists: false, isActive: false, revokedAt: null, expiresAt: null } }),
      ).status,
    ).toBe("noKey");
    expect(
      deriveLaneStatus(
        withFacts({ key: { exists: true, isActive: true, revokedAt: RECENT, expiresAt: null } }),
      ).status,
    ).toBe("keyNotValid");
  });

  it("refuses a retired app at the key hop, whatever else is true", () => {
    const v = deriveLaneStatus(withFacts({ appRetired: true }));
    expect(v.status).toBe("keyNotValid");
    expect(v.because).toContain("retired");
  });
});

describe("binding states all belong to the platform admin", () => {
  it("says no system when none matches", () => {
    expect(
      deriveLaneStatus(withFacts({ binding: { matchingConnections: 0, secretUnreadable: false } })).status,
    ).toBe("noSapSystem");
  });

  it("refuses to choose when two systems claim one environment", () => {
    const v = deriveLaneStatus(withFacts({ binding: { matchingConnections: 2, secretUnreadable: false } }));
    expect(v.status).toBe("bindingRefused");
    expect(v.because).toContain("will not choose");
  });

  it("owns up when the secret cannot be decrypted", () => {
    const v = deriveLaneStatus(withFacts({ binding: { matchingConnections: 1, secretUnreadable: true } }));
    expect(v.status).toBe("secretUnreadable");
    expect(v.because).toContain("Our fault");
  });

  it("puts every binding failure on the platform admin", () => {
    for (const status of ["noSapSystem", "bindingRefused", "secretUnreadable", "systemOff"] as const) {
      expect(LANE_STATUS_VOCABULARY[status].owner).toBe("platformAdmin");
    }
  });
});

describe("401 and 403 stay apart, because their owners differ", () => {
  it("routes a rejected sign-in to the platform admin", () => {
    const v = deriveLaneStatus(withFacts({ probe: { status: "UNAUTHORIZED", at: RECENT } }));
    expect(v.status).toBe("signInRefused");
    expect(LANE_STATUS_VOCABULARY[v.status].owner).toBe("platformAdmin");
    expect(v.because).toContain("Every lane on this system stops");
  });

  it("routes a refused read to the client's SAP admin", () => {
    const v = deriveLaneStatus(withFacts({ read: { outcome: "FORBIDDEN", at: RECENT, rows: null } }));
    expect(v.status).toBe("sapRefused");
    expect(LANE_STATUS_VOCABULARY[v.status].owner).toBe("clientSapAdmin");
    expect(v.because).toContain("fix is in SAP");
  });

  it("gives them different hops, so the trace marks different places", () => {
    const signIn = deriveLaneStatus(withFacts({ probe: { status: "UNAUTHORIZED", at: RECENT } }));
    const refused = deriveLaneStatus(withFacts({ read: { outcome: "FORBIDDEN", at: RECENT, rows: null } }));
    expect(signIn.brokenHop).toBe("sapMetadata");
    expect(refused.brokenHop).toBe("sapDataRead");
  });
});

describe("every verdict is usable", () => {
  it("returns a status that exists in the vocabulary", () => {
    const cases: LaneFacts[] = [
      healthy(),
      withFacts({ appRetired: true }),
      withFacts({ access: { decision: null, expiresAt: null, revokedAt: null } }),
      withFacts({ access: { decision: "REQUESTED", expiresAt: null, revokedAt: null } }),
      withFacts({ access: { decision: "APPROVED", expiresAt: ANCIENT, revokedAt: null } }),
      withFacts({ key: { exists: false, isActive: false, revokedAt: null, expiresAt: null } }),
      withFacts({ binding: { matchingConnections: 0, secretUnreadable: false } }),
      withFacts({ binding: { matchingConnections: 2, secretUnreadable: false } }),
      withFacts({ binding: { matchingConnections: 1, secretUnreadable: true } }),
      withFacts({ probe: { status: "UNAUTHORIZED", at: RECENT } }),
      withFacts({ probe: { status: "TIMEOUT", at: RECENT } }),
      withFacts({ read: { outcome: "FORBIDDEN", at: RECENT, rows: null } }),
      withFacts({ read: { outcome: "EMPTY", at: RECENT, rows: 0 } }),
      withFacts({ read: { outcome: null, at: null, rows: null } }),
    ];
    for (const facts of cases) {
      const v = deriveLaneStatus(facts);
      expect(LANE_STATUSES).toContain(v.status);
      expect(v.because.length, `${v.status} has no explanation`).toBeGreaterThan(20);
      expect(v.because.endsWith("."), `${v.status}: "${v.because}" is not a sentence`).toBe(true);
    }
  });

  it("names a broken hop that agrees with the vocabulary", () => {
    // The verdict and the status must not disagree about which hop failed.
    for (const facts of [
      withFacts({ access: { decision: null, expiresAt: null, revokedAt: null } }),
      withFacts({ key: { exists: false, isActive: false, revokedAt: null, expiresAt: null } }),
      withFacts({ binding: { matchingConnections: 0, secretUnreadable: false } }),
      withFacts({ probe: { status: "UNAUTHORIZED", at: RECENT } }),
      withFacts({ read: { outcome: "FORBIDDEN", at: RECENT, rows: null } }),
    ]) {
      const v = deriveLaneStatus(facts);
      expect(v.brokenHop).toBe(LANE_STATUS_VOCABULARY[v.status].brokenHop);
    }
  });

  it("has a Not started verdict distinct from No access", () => {
    // "Nobody asked" and "someone asked and the answer was no" are different
    // rows with different next steps.
    expect(notStartedVerdict().status).toBe("notStarted");
    expect(
      deriveLaneStatus(withFacts({ access: { decision: null, expiresAt: null, revokedAt: null } })).status,
    ).toBe("noAccess");
  });
});

describe("statuses this file deliberately cannot produce", () => {
  it("never invents the seven that have no backend behind them", () => {
    /*
     * rateLimited, circuitOpen and systemOff need capabilities PR-5 adds. This
     * file could fake them from adjacent data and must not: a chip that claims
     * rate limiting is enforced, where it is not, is a promise about where a
     * call stopped that nothing keeps.
     */
    const produced = new Set(
      [
        healthy(),
        withFacts({ appRetired: true }),
        withFacts({ access: { decision: null, expiresAt: null, revokedAt: null } }),
        withFacts({ access: { decision: "REQUESTED", expiresAt: null, revokedAt: null } }),
        withFacts({ access: { decision: "APPROVED", expiresAt: ANCIENT, revokedAt: null } }),
        withFacts({ key: { exists: false, isActive: false, revokedAt: null, expiresAt: null } }),
        withFacts({ binding: { matchingConnections: 0, secretUnreadable: false } }),
        withFacts({ binding: { matchingConnections: 2, secretUnreadable: false } }),
        withFacts({ binding: { matchingConnections: 1, secretUnreadable: true } }),
        withFacts({ probe: { status: "UNAUTHORIZED", at: RECENT } }),
        withFacts({ read: { outcome: "FORBIDDEN", at: RECENT, rows: null } }),
        withFacts({ read: { outcome: "EMPTY", at: RECENT, rows: 0 } }),
        withFacts({ read: { outcome: null, at: null, rows: null } }),
      ].map((f) => deriveLaneStatus(f).status),
    );
    for (const impossible of ["rateLimited", "circuitOpen", "systemOff"] as const) {
      expect(produced.has(impossible), `${impossible} should need PR-5`).toBe(false);
    }
  });
});
