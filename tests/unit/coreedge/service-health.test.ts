/**
 * Per-service health, and the owner it decides (PR-5, capability 10).
 *
 * The handoff's reason for the whole capability: "The 401/403 distinction and
 * the correct owner attribution both derive from this. One green dot per system
 * sends half of all triage to the wrong person."
 *
 * So most of these assertions are about who gets called.
 */

import { describe, expect, it } from "vitest";

import {
  ownerForService,
  readableServices,
  serviceHealthFactsOf,
  verdictForService,
  type ServiceHealthFacts,
} from "@/lib/coreedge/service-health";

const NOW = new Date("2026-09-12T12:00:00Z");
const RECENT = new Date(NOW.getTime() - 60_000);
const ANCIENT = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);

function facts(patch: Partial<ServiceHealthFacts> = {}): ServiceHealthFacts {
  return {
    metadataStatus: "OK",
    metadataAt: RECENT,
    readStatus: "OK",
    readAt: RECENT,
    readRowCount: 5,
    ...patch,
  };
}

describe("401 and 403 go to different people", () => {
  it("sends a rejected sign-in to the platform admin, whole-system", () => {
    const f = facts({ metadataStatus: "UNAUTHORIZED" });
    expect(verdictForService(f, NOW).status).toBe("signInRefused");
    expect(ownerForService(f, NOW)).toBe("Platform admin");
    expect(verdictForService(f, NOW).because).toContain("Every lane on this system stops");
  });

  it("sends a refused read to the client's SAP admin, one lane", () => {
    const f = facts({ readStatus: "FORBIDDEN" });
    expect(verdictForService(f, NOW).status).toBe("sapRefused");
    expect(ownerForService(f, NOW)).toBe("Client SAP admin");
    expect(verdictForService(f, NOW).because).toContain("fix is in SAP");
  });

  it("never gives them the same owner", () => {
    // This is the assertion the capability exists to make possible: before the
    // two facts were stored separately, both were one "Reachable" flag.
    expect(ownerForService(facts({ metadataStatus: "UNAUTHORIZED" }), NOW)).not.toBe(
      ownerForService(facts({ readStatus: "FORBIDDEN" }), NOW),
    );
  });
});

describe("reachable is not readable", () => {
  it("refuses to call a service Live on green metadata alone", () => {
    /*
     * The exact state the old console called "Reachable" and rendered as
     * healthy. It is not healthy — it is unmeasured, and a 403 on the entity
     * set is the most common thing hiding behind it.
     */
    const v = verdictForService(facts({ readStatus: null, readAt: null, readRowCount: null }), NOW);
    expect(v.status).toBe("unknown");
    expect(v.because).toContain("Reachable is not the same as readable");
  });

  it("puts that on the operator, not on SAP", () => {
    const f = facts({ readStatus: null, readAt: null, readRowCount: null });
    expect(ownerForService(f, NOW)).toBe("Operator");
  });
});

describe("an empty read is a success", () => {
  it("is No data, not a failure", () => {
    // Folding EMPTY into a failure is the single most common way this product
    // could lie about a healthy lane.
    const v = verdictForService(facts({ readStatus: "EMPTY", readRowCount: 0 }), NOW);
    expect(v.status).toBe("noData");
    expect(v.because).toContain("success");
  });

  it("needs nobody", () => {
    expect(ownerForService(facts({ readStatus: "EMPTY", readRowCount: 0 }), NOW)).toContain("Nobody");
  });
});

describe("staleness decays to Unknown on both hops", () => {
  it("expires a stale metadata check", () => {
    expect(verdictForService(facts({ metadataAt: ANCIENT }), NOW).status).toBe("unknown");
  });

  it("expires a stale read even when metadata is fresh", () => {
    expect(verdictForService(facts({ readAt: ANCIENT }), NOW).status).toBe("unknown");
  });

  it("distinguishes 'never checked' from 'checked long ago'", () => {
    const never = verdictForService(facts({ metadataStatus: null, metadataAt: null }), NOW);
    const stale = verdictForService(facts({ metadataAt: ANCIENT }), NOW);
    expect(never.because).not.toBe(stale.because);
    expect(never.because).toContain("never been checked");
  });
});

describe("metadata is consulted before the read", () => {
  it("reports one problem when sign-in fails, not two", () => {
    // If we cannot sign in, nothing about the read is knowable — and reporting
    // a stale read alongside a 401 suggests two problems where there is one.
    const v = verdictForService(
      facts({ metadataStatus: "UNAUTHORIZED", readStatus: null, readAt: null }),
      NOW,
    );
    expect(v.status).toBe("signInRefused");
  });
});

describe("an observed read failure is never 'not proven' (P0.2 review round 3)", () => {
  it("reads as sign-in refused, as the lane board reads it — never 'no read has been proven'", () => {
    // The sweep writes UNAUTHORIZED for a read answered 401; the reader's own
    // copy of the vocabulary dropped it to null, i.e. "not proven".
    const stored = { metadataStatus: "OK", metadataAt: RECENT, readStatus: "UNAUTHORIZED", readAt: RECENT, readRowCount: null };
    const v = verdictForService(serviceHealthFactsOf(stored), NOW);
    expect(v.status).toBe("signInRefused");
    expect(v.because).not.toMatch(/not been proven|no read has been proven/i);
    expect(v.provenAt).toEqual(RECENT);
    expect(readableServices([stored], NOW)).toEqual({ readable: 0, unproven: 0 });
  });

  it("a fresh 404 on the read is failing in the tile too, never 'not proven in 24 h'", () => {
    // The verdict stays Unknown (no chip for a 404 yet, below), but the read
    // ran and failed, and the per-service row draws it failed.
    const notFound = { metadataStatus: "OK", metadataAt: RECENT, readStatus: "NOT_FOUND", readAt: RECENT, readRowCount: null };
    expect(verdictForService(serviceHealthFactsOf(notFound), NOW).status).toBe("unknown");
    expect(readableServices([notFound], NOW)).toEqual({ readable: 0, unproven: 0 });
    // An aged 404 is old evidence like any other: not proven in the window.
    expect(readableServices([{ ...notFound, metadataAt: ANCIENT, readAt: ANCIENT }], NOW)).toEqual({
      readable: 0,
      unproven: 1,
    });
  });
});

describe("a 404 is not reported as a 403", () => {
  it("says what it knows rather than naming a wrong owner", () => {
    /*
     * PR-2 found the eighteen statuses have no chip for a dataset 404, and the
     * nearest — SAP refused — is explicitly a 403 and would send the user to
     * their SAP admin over something a different dataset would fix. Until that
     * design decision is made, Unknown with the real reason is at least true.
     */
    const v = verdictForService(facts({ readStatus: "NOT_FOUND" }), NOW);
    expect(v.status).toBe("unknown");
    expect(v.status).not.toBe("sapRefused");
    expect(v.because).toContain("not found");
    expect(ownerForService(facts({ readStatus: "NOT_FOUND" }), NOW)).not.toBe("Client SAP admin");
  });
});

describe("Live carries its evidence", () => {
  it("names the row count it proved", () => {
    const v = verdictForService(facts({ readRowCount: 5 }), NOW);
    expect(v.status).toBe("live");
    expect(v.because).toContain("5 rows");
    expect(v.provenAt).toEqual(RECENT);
  });

  it("counts one row in the singular", () => {
    expect(verdictForService(facts({ readRowCount: 1 }), NOW).because).toContain("1 row proven");
  });
});
