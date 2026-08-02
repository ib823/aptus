/**
 * The topology says only what the data can support.
 *
 * This is the module that decides what colour a node is on a diagram that will
 * be the first thing anyone sees in the Console. Every assertion below exists
 * because getting it wrong would put a confident claim on screen that the
 * platform cannot stand behind.
 *
 * The two that matter most:
 *
 *   · A revoked grant that CARRIED traffic must not read as never-observed.
 *     That would assert no call ever ran under it — unknowable, and usually
 *     false. `state` and `ended` are independent for exactly this reason.
 *
 *   · DEFECT means somebody must act. A SANDBOX_ONLY decision on a PROD grant
 *     looks wrong and is correct: the label is not the permission. If it were
 *     a defect, the badge would stop meaning anything.
 */

import { describe, expect, it } from "vitest";

import {
  COLLAPSE_THRESHOLD,
  collapseColumn,
  deriveConnection,
  deriveCredential,
  deriveGrant,
  routeFor,
  type TopologyNode,
} from "@/lib/ops/topology";

const NOW = new Date("2026-08-02T00:00:00.000Z");
const PAST = new Date("2026-06-01T00:00:00.000Z");
const FUTURE = new Date("2026-12-01T00:00:00.000Z");

const grant = (over: Partial<Parameters<typeof deriveGrant>[0]> = {}) =>
  deriveGrant(
    {
      id: "g",
      decision: "APPROVED",
      environment: "PROD",
      expiresAt: FUTURE,
      revokedAt: null,
      revokedReason: null,
      recordedCalls: 0,
      ...over,
    },
    NOW,
  );

describe("an unbounded settled grant is a defect, before anything else", () => {
  it("fires regardless of whether it carried traffic", () => {
    for (const recordedCalls of [0, 4000]) {
      const d = grant({ expiresAt: null, recordedCalls });
      expect(d.state).toBe("defect");
      expect(d.badge).toBe("UNBOUNDED");
      expect(d.incidentId).toBe("unbounded-grant");
    }
  });

  it("does not fire on a decision that confers nothing", () => {
    // REJECTED with no expiry is not standing access — there is nothing to end.
    for (const decision of ["REJECTED", "REQUESTED"] as const) {
      expect(grant({ decision, expiresAt: null }).state).not.toBe("defect");
    }
  });

  it("does not fire once the grant has been revoked", () => {
    // Revocation ended it. An unbounded row that somebody already closed is
    // not an outstanding action.
    const d = grant({ expiresAt: null, revokedAt: PAST });
    expect(d.state).not.toBe("defect");
    expect(d.ended?.kind).toBe("revoked");
  });
});

describe("state and ended are independent — the whole point of the split", () => {
  it("a revoked grant that carried traffic stays observed-good", () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR. Collapsing this into never-observed
     * claims no call ever ran under it. The audit feed says otherwise.
     */
    const d = grant({ revokedAt: PAST, revokedReason: "solution retired", recordedCalls: 812 });
    expect(d.state).toBe("observed-good");
    expect(d.ended).toEqual({
      kind: "revoked",
      at: PAST.toISOString(),
      carried: true,
      reason: "solution retired",
    });
  });

  it("a revoked grant that carried nothing is never-observed, and ended", () => {
    const d = grant({ revokedAt: PAST, recordedCalls: 0 });
    expect(d.state).toBe("never-observed");
    expect(d.ended?.carried).toBe(false);
  });

  it("a rejected grant can never have carried anything", () => {
    // It authorised nothing, so carried:true would be incoherent — assert it
    // is not merely absent but impossible.
    const d = grant({ decision: "REJECTED", recordedCalls: 999 });
    expect(d.state).toBe("never-observed");
    expect(d.ended?.carried).toBe(false);
  });

  it("a live grant is never marked ended", () => {
    expect(grant({ recordedCalls: 12 }).ended).toBeNull();
    expect(grant({ recordedCalls: 0 }).ended).toBeNull();
  });

  it("lapses on the clock, not only on the enum", () => {
    // A row still reading APPROVED whose expiry has passed is expired in fact.
    const d = grant({ expiresAt: PAST, recordedCalls: 3 });
    expect(d.ended?.kind).toBe("expired");
    expect(d.state).toBe("observed-good");
  });
});

describe("SANDBOX_ONLY on a non-sandbox grant is quiet, not a defect", () => {
  it("authorises nothing, and says so, without the defect treatment", () => {
    const d = grant({ decision: "SANDBOX_ONLY", environment: "PROD" });
    expect(d.state).toBe("never-observed");
    expect(d.quiet).toBe(true);
    expect(d.badge).toBe("AUTHORISES NOTHING");
    expect(d.incidentId).toBeUndefined();
  });

  it("carries no incident, because no rule watches this condition", () => {
    /*
     * `binding-refused` is the tempting one and it is wrong: that rule is about
     * a call that could not be bound to a connection for its environment. A
     * grant refused on its decision never reaches a connection at all.
     */
    expect(grant({ decision: "SANDBOX_ONLY", environment: "PROD" }).incidentId).toBeUndefined();
  });

  it("is not quiet when the environment actually is SANDBOX", () => {
    // There it is an ordinary, coherent grant.
    const d = grant({ decision: "SANDBOX_ONLY", environment: "SANDBOX", recordedCalls: 5 });
    expect(d.quiet).toBe(false);
    expect(d.state).toBe("observed-good");
  });
});

describe("a connection's blank probe is not health", () => {
  const conn = (over: Partial<Parameters<typeof deriveConnection>[0]> = {}) =>
    deriveConnection({
      environment: "PROD",
      lastValidatedAt: PAST,
      lastValidationStatus: "OK",
      isActive: true,
      ...over,
    });

  it("never probed reads as never-observed, not good", () => {
    const d = conn({ lastValidatedAt: null, lastValidationStatus: null });
    expect(d.state).toBe("never-observed");
    expect(d.incidentId).toBeUndefined();
  });

  it("a failed probe is observed-bad and names the rule", () => {
    const d = conn({ lastValidationStatus: "TIMEOUT" });
    expect(d.state).toBe("observed-bad");
    expect(d.badge).toBe("TIMEOUT");
    expect(d.incidentId).toBe("connection-unhealthy");
  });

  it("an undeclared environment outranks the probe", () => {
    /*
     * A standing defect beats an absence of information: reads through it are
     * served but marked unverified and writes are refused outright, which is
     * true whether or not it last answered.
     */
    const d = conn({ environment: null, lastValidationStatus: "OK" });
    expect(d.state).toBe("defect");
    expect(d.incidentId).toBe("undeclared-environment");
  });
});

describe("a credential's blank last-used is an absent observation", () => {
  const cred = (over: Partial<Parameters<typeof deriveCredential>[0]> = {}) =>
    deriveCredential(
      { expiresAt: FUTURE, revokedAt: null, lastUsedAt: PAST, isActive: true, ...over },
      NOW,
    );

  it("no recorded use reads as never-observed, never as unused", () => {
    // lastUsedAt is fire-and-forget and often does not land.
    expect(cred({ lastUsedAt: null }).state).toBe("never-observed");
  });

  it("an active credential with no expiry is a defect", () => {
    const d = cred({ expiresAt: null });
    expect(d.state).toBe("defect");
    expect(d.incidentId).toBe("credential-without-expiry");
  });

  it("a revoked credential keeps the state its use earned", () => {
    const d = cred({ revokedAt: PAST, lastUsedAt: PAST });
    expect(d.state).toBe("observed-good");
    expect(d.ended).toMatchObject({ kind: "revoked", carried: true });
  });
});

describe("collapsing a column keeps what needs acting on", () => {
  const node = (id: string, over: Partial<TopologyNode> = {}): TopologyNode => ({
    id,
    kind: "grant",
    column: 2,
    label: id,
    state: "observed-good",
    ended: null,
    quiet: false,
    badge: null,
    href: "/control-tower/grants",
    provenance: { derived: "", observedAt: null, cannotTell: "" },
    ...over,
  });

  it("leaves a short column alone", () => {
    const nodes = [node("a"), node("b")];
    expect(collapseColumn(nodes).collapsedCount).toBe(0);
    expect(collapseColumn(nodes).kept).toHaveLength(2);
  });

  it("reports how many it folded away — never truncates silently", () => {
    const nodes = Array.from({ length: COLLAPSE_THRESHOLD + 7 }, (_, i) => node(`n${i}`));
    const { kept, collapsedCount } = collapseColumn(nodes);
    expect(kept).toHaveLength(COLLAPSE_THRESHOLD);
    expect(collapsedCount).toBe(7);
    expect(kept.length + collapsedCount).toBe(nodes.length);
  });

  it("keeps defects and ended-but-carried ahead of healthy rows", () => {
    const nodes = [
      ...Array.from({ length: COLLAPSE_THRESHOLD }, (_, i) => node(`ok${i}`)),
      node("defect", { state: "defect" }),
      node("wasLive", { ended: { kind: "revoked", at: PAST.toISOString(), carried: true } }),
    ];
    const ids = collapseColumn(nodes).kept.map((n) => n.id);
    expect(ids).toContain("defect");
    expect(ids).toContain("wasLive");
  });
});

describe("a node links to its own workspace's screen", () => {
  it("uses the label vocabulary of the active lens", () => {
    // The same connection is Connections in Studio and Operations but the
    // Connection register in Control Tower.
    expect(routeFor("developer-studio", "connection", "/x")).toBe("/studio/connections");
    expect(routeFor("operations-center", "connection", "/x")).toBe("/operations/connections");
    expect(routeFor("control-tower", "connection", "/x")).toBe("/control-tower/connections");
  });

  it("sends a credential to Tokens in Operations and the register in Control Tower", () => {
    expect(routeFor("operations-center", "credential", "/x")).toBe("/operations/tokens");
    expect(routeFor("control-tower", "credential", "/x")).toBe("/control-tower/tokens");
  });

  it("falls back rather than inventing a route", () => {
    expect(routeFor("developer-studio", "tenant", "/fallback")).toBe("/fallback");
  });
});
