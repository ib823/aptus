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

import { $Enums } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { OPS_WINDOWS } from "@/components/ops/useOpsFeed";
import { INCIDENT_RULES } from "@/lib/ops/incidents";
import {
  BANDS,
  COLLAPSE_THRESHOLD,
  COLUMN_COUNT,
  COLUMN_LABELS,
  EDGE_WEIGHT,
  LAYOUT,
  DEFAULT_WINDOW_HOURS,
  bandExtent,
  carriedBefore,
  deriveSolution,
  attributeCalls,
  collapseColumn,
  deriveConnection,
  deriveCredential,
  deriveGrant,
  grantKey,
  layoutTopology,
  lensShowsTraffic,
  observeEdge,
  orthoPath,
  pairKey,
  pulseCount,
  routeFor,
  tallyOf,
  type AuditSlice,
  type TopologyNode,
} from "@/lib/ops/topology";

const NOW = new Date("2026-08-02T00:00:00.000Z");
const PAST = new Date("2026-06-01T00:00:00.000Z");
const FUTURE = new Date("2026-12-01T00:00:00.000Z");

/**
 * The window the fixtures read through, opening well before PAST.
 *
 * DELIBERATELY WIDE. `carried` is only answerable when the row ended INSIDE the
 * window, so a narrow default here would turn most of these assertions into
 * tests of `unobservable` rather than of the branch they are about. The
 * window's own effect is tested separately, below.
 */
const SINCE = new Date("2026-01-01T00:00:00.000Z");

const grant = (over: Partial<Parameters<typeof deriveGrant>[0]> = {}, since: Date = SINCE) =>
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
    since,
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

/* ─────────────────────────── edges and layout ─────────────────────────── */

describe("an edge reports what was recorded along it", () => {
  it("separates mixed from good and bad, because both extremes would be a claim", () => {
    expect(observeEdge(0, 0)).toBe("never");
    expect(observeEdge(100, 0)).toBe("good");
    expect(observeEdge(100, 100)).toBe("bad");
    // 900 through and 100 refused is neither. Green hides the refusals; red
    // says nothing got through. Both are wrong in a way somebody would act on.
    expect(observeEdge(1000, 100)).toBe("mixed");
  });

  it("never reports more failures than calls as anything but bad", () => {
    // Defensive: a tally can only ever be built by adding the same row to both
    // counters, but a future caller could pass junk and must not get "good".
    expect(observeEdge(5, 9)).toBe("bad");
  });
});

describe("call attribution pairs both ends, and never repeats one end's total", () => {
  const slice = (over: Partial<AuditSlice> = {}): AuditSlice => ({
    solutionId: "sol1",
    interfaceId: "if1",
    connectionId: "conn1",
    clientTokenId: "tok1",
    externalId: "API_BUSINESS_PARTNER",
    operation: "READ",
    environment: "PROD",
    status: 200,
    count: 1,
    ...over,
  });

  /**
   * THE REGRESSION THIS FILE EXISTS FOR.
   *
   * The first version derived edges from node totals: every credential on a
   * solution got an edge carrying the GRANT's full count. One call then
   * rendered as three, along two pairings that never happened. Invisible while
   * nothing drew the lines; a fabricated wiring diagram the moment it did.
   *
   * The chain now runs credential → solution → grant, and both of those links
   * are foreign keys, so that particular fan-out is no longer expressible. What
   * remains testable — and what the bug was really about — is that a pairing
   * carries only its own traffic.
   */
  it("attributes a call to the one credential that made it, not to every credential on the solution", () => {
    const a = attributeCalls([slice({ clientTokenId: "tok1", count: 400 })]);
    const gk = grantKey("sol1", "API_BUSINESS_PARTNER", "READ", "PROD");

    expect(a.byGrant.get(gk)).toEqual({ calls: 400, failures: 0 });
    expect(tallyOf(a.byCredentialSolution, pairKey("tok1", "sol1")).calls).toBe(400);
    // The other two credentials on the same solution have no pairing at all.
    expect(tallyOf(a.byCredentialSolution, pairKey("tok2", "sol1")).calls).toBe(0);
    expect(tallyOf(a.byCredentialSolution, pairKey("tok3", "sol1")).calls).toBe(0);
  });

  it("sums a pairing across rows without double counting the node totals", () => {
    const a = attributeCalls([
      slice({ clientTokenId: "tok1", count: 10 }),
      slice({ clientTokenId: "tok2", count: 5 }),
    ]);

    expect(a.bySolution.get("sol1")?.calls).toBe(15);
    expect(tallyOf(a.byCredentialSolution, pairKey("tok1", "sol1")).calls).toBe(10);
    expect(tallyOf(a.byCredentialSolution, pairKey("tok2", "sol1")).calls).toBe(5);
    // The pairings must add back up to the node total, exactly once each.
    const paired = [...a.byCredentialSolution.values()].reduce((n, t) => n + t.calls, 0);
    expect(paired).toBe(a.bySolution.get("sol1")?.calls);
  });

  it("pairs an interface with a connection only when one row named both", () => {
    const a = attributeCalls([
      slice({ interfaceId: "if1", connectionId: "conn1", count: 7 }),
      // A refusal before binding: the interface is known, the connection is not.
      slice({ interfaceId: "if2", connectionId: null, status: 403, count: 3 }),
    ]);

    expect(tallyOf(a.byInterfaceConnection, pairKey("if1", "conn1")).calls).toBe(7);
    // if2 never reached conn1, so no line may be drawn between them — there is
    // no schema link to fall back on; binding is resolved per call.
    expect(a.byInterfaceConnection.has(pairKey("if2", "conn1"))).toBe(false);
    expect(a.byInterface.get("if2")).toEqual({ calls: 3, failures: 3 });
    expect(a.byConnection.get("conn1")?.calls).toBe(7);
  });

  it("counts a refusal as a recorded call, because the broker was reached", () => {
    const a = attributeCalls([
      slice({ status: 200, count: 90 }),
      slice({ status: 403, count: 10 }),
    ]);
    const gk = grantKey("sol1", "API_BUSINESS_PARTNER", "READ", "PROD");
    expect(a.byGrant.get(gk)).toEqual({ calls: 100, failures: 10 });
    expect(observeEdge(100, 10)).toBe("mixed");
  });

  it("treats 5xx as a failure and 3xx as not one", () => {
    const a = attributeCalls([
      slice({ status: 500, count: 2 }),
      slice({ status: 304, count: 4 }),
    ]);
    const gk = grantKey("sol1", "API_BUSINESS_PARTNER", "READ", "PROD");
    expect(a.byGrant.get(gk)).toEqual({ calls: 6, failures: 2 });
  });

  it("is case-insensitive on the grant tuple, because the enum casing is not guaranteed", () => {
    expect(grantKey("s", "api", "read", "prod")).toBe(grantKey("S", "API", "READ", "PROD"));
  });

  it("returns a shared zero rather than undefined for a key it never saw", () => {
    const a = attributeCalls([]);
    expect(tallyOf(a.byGrant, "nothing")).toEqual({ calls: 0, failures: 0 });
  });
});

describe("the layout is computed, not measured", () => {
  const at = (id: string, column: number): TopologyNode => ({
    id,
    kind: "grant",
    column,
    label: id,
    state: "observed-good",
    ended: null,
    quiet: false,
    badge: null,
    href: "/control-tower/grants",
    provenance: { derived: "", observedAt: null, cannotTell: "" },
  });

  it("gives every node a position and reserves all six columns", () => {
    const l = layoutTopology([at("a", 0), at("b", 2), at("c", 2)]);
    expect(l.positions.size).toBe(3);
    expect(l.columnX).toHaveLength(COLUMN_COUNT);
    expect(l.columnX[0]).toBe(0);
    expect(l.columnX[1]).toBe(LAYOUT.nodeW + LAYOUT.colGap);
  });

  it("centres a short column against the tallest one", () => {
    // A lone caller must sit level with the MIDDLE of a column of four, not at
    // its top — otherwise the one node on the left reads as the first of a list.
    const many = [0, 1, 2, 3].map((i) => at(`g${i}`, 2));
    const l = layoutTopology([at("solo", 0), ...many]);
    const solo = l.positions.get("solo")!;
    const first = l.positions.get("g0")!;
    const last = l.positions.get("g3")!;
    expect(solo.y).toBeGreaterThan(first.y);
    expect(solo.y + LAYOUT.nodeH / 2).toBeCloseTo((first.y + last.y + LAYOUT.nodeH) / 2, 5);
  });

  it("reserves a row for the collapsed chip so it cannot land on a node", () => {
    const l = layoutTopology([at("a", 1), at("b", 1)], [{ column: 1, count: 9 }]);
    const chip = l.chips.get(1)!;
    const ys = [...l.positions.values()].map((p) => p.y);
    expect(chip).toBeDefined();
    for (const y of ys) expect(Math.abs(y - chip.y)).toBeGreaterThanOrEqual(LAYOUT.nodeH);
  });

  it("ignores a collapse entry with a zero count", () => {
    expect(layoutTopology([at("a", 1)], [{ column: 1, count: 0 }]).chips.has(1)).toBe(false);
  });

  it("survives an empty graph without producing a negative canvas", () => {
    const l = layoutTopology([]);
    expect(l.height).toBeGreaterThan(0);
    expect(l.width).toBeGreaterThan(0);
  });
});

describe("the connector between two nodes", () => {
  it("draws a straight line when the two ends are level", () => {
    expect(orthoPath(0, 50, 100, 50)).toBe("M 0 50 L 100 50");
  });

  it("turns with a radius that never exceeds the run it has to turn inside", () => {
    // Two nodes almost level: a full 8px radius would overshoot the 4px drop
    // and the corner would bulge back on itself.
    const d = orthoPath(0, 50, 100, 54);
    expect(d).toContain("M 0 50");
    expect(d).toContain("L 100 54");
    expect(d).not.toContain("NaN");
    expect(d).not.toMatch(/-\d+\.?\d* \d+ Q/); // no negative-x waypoint
  });

  it("goes up as readily as down", () => {
    const down = orthoPath(0, 0, 100, 100);
    const up = orthoPath(0, 100, 100, 0);
    expect(down).not.toBe(up);
    for (const d of [down, up]) expect(d).not.toContain("NaN");
  });
});

describe("replay is a legibility device, and says so", () => {
  it("never animates an edge that carried nothing", () => {
    expect(pulseCount(0)).toBe(0);
    expect(pulseCount(-1)).toBe(0);
  });

  it("shows at least one pulse for any recorded traffic at all", () => {
    expect(pulseCount(1)).toBeGreaterThanOrEqual(1);
  });

  it("caps, because one pulse per call would imply the count is exact", () => {
    // It never is — the feed is a floor, which is why the line is labelled ≥.
    expect(pulseCount(1_000_000)).toBeLessThanOrEqual(8);
    expect(pulseCount(50)).toBeLessThan(pulseCount(50_000));
  });
});

describe("only the workspace that asks about traffic draws it loudly", () => {
  it("gives the Operations Center full weight and the others context weight", () => {
    expect(EDGE_WEIGHT["operations-center"]).toBe(1);
    expect(EDGE_WEIGHT["developer-studio"]).toBeLessThan(0.5);
    expect(EDGE_WEIGHT["control-tower"]).toBeLessThan(1);
  });

  it("offers counts and replay in the Operations Center alone", () => {
    expect(lensShowsTraffic("operations-center")).toBe(true);
    expect(lensShowsTraffic("developer-studio")).toBe(false);
    expect(lensShowsTraffic("control-tower")).toBe(false);
  });
});

/**
 * Every decision the enum can hold is classified on purpose.
 *
 * WHY THIS EXISTS. `topology.ts` imports `$Enums` as a TYPE only — a value
 * import would put the Prisma runtime into the browser bundle that draws the
 * graph — so the decision names live in that file as string literals. The
 * compiler catches a typo, and catches nothing at all when a NEW decision is
 * added to the schema: it falls quietly into the default branch and renders as
 * an ordinary live grant.
 *
 * A test file has no such constraint, so this is where the two are tied
 * together. Adding a decision to the schema fails here, by name, until somebody
 * has said what it means.
 */
describe("the decision vocabulary is pinned to the schema", () => {
  /**
   * What each decision means for a grant with an expiry and no revocation.
   *
   * `unboundedIsDefect` is the settled-AND-confers-access pair, read back
   * through the one rule that observes it. `endsBy` is separate on purpose: a
   * decision can confer nothing going forward and still have carried traffic
   * before it stopped, which is precisely what `ended` exists to record.
   */
  const EXPECTED: Record<
    $Enums.GrantDecision,
    { unboundedIsDefect: boolean; endsBy: string | null; observedWithTraffic: string }
  > = {
    REQUESTED: { unboundedIsDefect: false, endsBy: null, observedWithTraffic: "never-observed" },
    APPROVED: { unboundedIsDefect: true, endsBy: null, observedWithTraffic: "observed-good" },
    SANDBOX_ONLY: { unboundedIsDefect: true, endsBy: null, observedWithTraffic: "observed-good" },
    READ_ONLY: { unboundedIsDefect: true, endsBy: null, observedWithTraffic: "observed-good" },
    REJECTED: { unboundedIsDefect: false, endsBy: "rejected", observedWithTraffic: "never-observed" },
    // Expired, and still observed-good if it carried anything before it lapsed.
    EXPIRED: { unboundedIsDefect: false, endsBy: "expired", observedWithTraffic: "observed-good" },
  };

  it("covers every member the schema declares", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.values($Enums.GrantDecision).sort());
  });

  it.each(Object.values($Enums.GrantDecision))(
    "%s is classified, not defaulted",
    (decision) => {
      const e = EXPECTED[decision];

      /*
       * A missing expiry is a DEFECT exactly when the decision is settled and
       * confers access — the one state on this canvas that means somebody must
       * act. Reading it back this way is the only observable check on the two
       * private sets in `topology.ts`.
       */
      expect(grant({ decision, expiresAt: null }).state === "defect").toBe(e.unboundedIsDefect);

      // Sandbox environment, so the SANDBOX_ONLY quiet branch does not apply.
      const bounded = grant({ decision, environment: "SANDBOX", recordedCalls: 5 });
      expect(bounded.state).not.toBe("defect");
      expect(bounded.state).toBe(e.observedWithTraffic);
      expect(bounded.ended?.kind ?? null).toBe(e.endsBy);
    },
  );
});

/* ────────────────────── the solution column ────────────────────── */

/**
 * The spine, and the defect it makes visible.
 *
 * WHAT THIS CLOSES. The module header has always declared four defect classes,
 * one of them "a solution with an empty owner slot". There was no solution node,
 * so that defect could never render — a documented condition with no way to
 * appear, which reads to anyone looking at the canvas as an all-clear.
 */
describe("a solution with an empty owner slot", () => {
  const sol = (over: Partial<Parameters<typeof deriveSolution>[0]> = {}) =>
    deriveSolution({ missingOwnerCount: 0, recordedCalls: 0, holdsProdGrant: false, ...over });

  it("is a defect wherever it occurs, PROD or not", () => {
    // The slot is who gets called when this breaks. Empty means nobody.
    for (const holdsProdGrant of [true, false]) {
      expect(sol({ missingOwnerCount: 1, holdsProdGrant }).state).toBe("defect");
    }
  });

  it("counts the empty slots rather than saying merely 'unowned'", () => {
    expect(sol({ missingOwnerCount: 1 }).badge).toBe("1 OWNER MISSING");
    expect(sol({ missingOwnerCount: 3 }).badge).toBe("3 OWNERS MISSING");
  });

  it("claims the incident rule only when the rule would actually fire", () => {
    /*
     * `unaccountable-prod-grant` fires when an unowned solution holds a grant
     * conferring PROD access — and only then. Attaching it to every unowned
     * solution would tell a reader the condition is monitored when it is not,
     * which is the more comfortable lie and the more dangerous one.
     */
    expect(sol({ missingOwnerCount: 2, holdsProdGrant: true }).incidentId).toBe(
      "unaccountable-prod-grant",
    );
    const sandboxOnly = sol({ missingOwnerCount: 2, holdsProdGrant: false });
    expect(sandboxOnly.incidentId).toBeUndefined();
    expect(sandboxOnly.noRule, "an unwatched defect must say it is unwatched").toContain(
      "No incident rule watches this",
    );
  });

  it("is never a defect merely for being quiet", () => {
    const owned = sol({ recordedCalls: 0 });
    expect(owned.state).toBe("never-observed");
    expect(owned.incidentId).toBeUndefined();
    expect(sol({ recordedCalls: 12 }).state).toBe("observed-good");
  });

  it("names an incident rule that exists", () => {
    // A rule id nobody can look up is worse than none: it sends a reader to a
    // screen that will never mention this node.
    const withRule = sol({ missingOwnerCount: 1, holdsProdGrant: true });
    expect(Object.values(INCIDENT_RULES).map((r) => r.id)).toContain(withRule.incidentId);
  });

  it("pairs a credential with the one solution it belongs to", () => {
    const a = attributeCalls([
      {
        solutionId: "sol1",
        interfaceId: null,
        connectionId: null,
        clientTokenId: "tok1",
        externalId: "API",
        operation: "READ",
        environment: "PROD",
        status: 200,
        count: 12,
      },
    ]);
    expect(tallyOf(a.bySolution, "sol1").calls).toBe(12);
    expect(tallyOf(a.byCredentialSolution, pairKey("tok1", "sol1")).calls).toBe(12);
    expect(tallyOf(a.byCredentialSolution, pairKey("tok1", "sol2")).calls).toBe(0);
  });
});

describe("the direction of the graph is written on it, in the product's own words", () => {
  it("runs caller to SAP, in the order a request is resolved", () => {
    expect(COLUMN_LABELS).toEqual([
      "Caller",
      "Credential",
      "Solution",
      "Grant",
      "Interface",
      "Connection",
      "SAP tenant",
    ]);
    expect(COLUMN_LABELS).toHaveLength(COLUMN_COUNT);
  });

  it("bands every column exactly once, with no gap and no overlap", () => {
    // A column outside every band would sit under blank space and read as
    // belonging to whichever band happened to be nearest.
    const covered: number[] = [];
    for (const b of BANDS) for (let c = b.from; c <= b.to; c++) covered.push(c);
    expect(covered.sort((x, y) => x - y)).toEqual([...Array(COLUMN_COUNT).keys()]);
  });

  it("splits where the broker stops resolving and starts calling SAP", () => {
    // Everything through Interface is decided before a customer system is
    // touched; Connection is where the upstream call is actually made.
    const northbound = BANDS.find((b) => b.label.toLowerCase().includes("northbound"))!;
    expect(northbound.from).toBe(0);
    expect(COLUMN_LABELS[northbound.to]).toBe("Interface");
    expect(COLUMN_LABELS[northbound.to + 1]).toBe("Connection");
  });

  it("does not invent 'southbound', a word this product has never used", () => {
    /*
     * It appears in no route, no model, no doc and no manual page. Adding it
     * for symmetry would teach a reader a term they will never see again and
     * make the manual wrong by omission. The SAP-facing half is called what the
     * resolver calls it: binding.
     */
    const text = BANDS.map((b) => `${b.label} ${b.note}`).join(" ").toLowerCase();
    expect(text).not.toContain("southbound");
    expect(text).toContain("northbound");
    expect(text).toContain("bind");
  });

  it("gives every band a note, because a label alone is not an explanation", () => {
    for (const b of BANDS) expect(b.note.length).toBeGreaterThan(60);
  });

  it("spans a band across all of its columns", () => {
    const layout = layoutTopology([]);
    const { x, width } = bandExtent(BANDS[0]!, layout);
    expect(x).toBe(0);
    expect(width).toBe(
      (BANDS[0]!.to - BANDS[0]!.from) * (LAYOUT.nodeW + LAYOUT.colGap) + LAYOUT.nodeW,
    );
  });

  it("leaves room above the columns for the band", () => {
    const l = layoutTopology([
      {
        id: "n",
        kind: "grant",
        column: 0,
        label: "n",
        state: "observed-good",
        ended: null,
        quiet: false,
        badge: null,
        href: "/x",
        provenance: { derived: "", observedAt: null, cannotTell: "" },
      },
    ]);
    expect(l.positions.get("n")!.y).toBeGreaterThanOrEqual(LAYOUT.bandH + LAYOUT.headerH);
  });
});

describe("the layout never drops a node without saying so", () => {
  it("reports a node it could not place instead of silently omitting it", () => {
    /*
     * Silent truncation is never acceptable — the same rule `collapseColumn`
     * already obeys. A node whose column falls outside the grid gets no
     * position, the component renders nothing for it, and the canvas looks
     * complete. That is how a seventh column shipped once and an eighth would
     * again.
     */
    const stray: TopologyNode = {
      id: "stray",
      kind: "grant",
      column: COLUMN_COUNT,
      label: "stray",
      state: "observed-good",
      ended: null,
      quiet: false,
      badge: null,
      href: "/x",
      provenance: { derived: "", observedAt: null, cannotTell: "" },
    };
    const l = layoutTopology([stray]);
    expect(l.positions.has("stray")).toBe(false);
    expect(l.unplaced, "an unplaceable node must be reported, not dropped").toEqual(["stray"]);
  });

  it("reports nothing when every node fits", () => {
    expect(layoutTopology([]).unplaced).toEqual([]);
  });
});

/**
 * The window decides what "observed" means, and it must not decide more.
 *
 * THE FAILURE THIS CATCHES. Every count on the canvas comes from a feed bounded
 * to the selected window. While `carried` was a plain boolean, a grant revoked
 * three months ago had no rows inside a 24-hour window and therefore reported
 * `carried: false` — "nothing ever ran under this" — for essentially every
 * ended row on the default view. That is the exact assertion the state/ended
 * split was built to prevent, made by the split itself.
 */
describe("what the window can and cannot answer", () => {
  const NARROW = new Date("2026-08-01T00:00:00.000Z"); // opens after PAST

  it("cannot say whether a grant revoked before the window ever carried traffic", () => {
    const d = grant({ revokedAt: PAST, recordedCalls: 0 }, NARROW);
    expect(d.ended?.carried, "false here would be a claim made by not looking").toBeNull();
    expect(d.state).toBe("unobservable");
  });

  it("still says false when the row ended inside the window and nothing was recorded", () => {
    // Here the feed genuinely covers the period, so the absence is evidence.
    const d = grant({ revokedAt: PAST, recordedCalls: 0 }, SINCE);
    expect(d.ended?.carried).toBe(false);
    expect(d.state).toBe("never-observed");
  });

  it("says true on recorded traffic regardless of where the window opens", () => {
    for (const since of [SINCE, NARROW]) {
      const d = grant({ revokedAt: PAST, recordedCalls: 812 }, since);
      expect(d.ended?.carried).toBe(true);
      expect(d.state).toBe("observed-good");
    }
  });

  it("applies the same rule to expiry as to revocation", () => {
    expect(grant({ expiresAt: PAST }, NARROW).ended?.carried).toBeNull();
    expect(grant({ expiresAt: PAST }, SINCE).ended?.carried).toBe(false);
  });

  it("keeps a rejected grant at false, because that one is knowable absolutely", () => {
    // It authorised nothing, so nothing can have run under it — no window needed.
    expect(grant({ decision: "REJECTED" }, NARROW).ended?.carried).toBe(false);
  });

  it("leaves a live grant alone — there is nothing ended to ask about", () => {
    expect(grant({ recordedCalls: 0 }, NARROW).ended).toBeNull();
  });

  it("computes the boundary directly, with no window to argue about", () => {
    const at = new Date("2026-05-01T00:00:00.000Z");
    expect(carriedBefore(0, at, new Date("2026-06-01T00:00:00.000Z"))).toBeNull();
    expect(carriedBefore(0, at, new Date("2026-04-01T00:00:00.000Z"))).toBe(false);
    expect(carriedBefore(9, at, new Date("2026-06-01T00:00:00.000Z"))).toBe(true);
  });
});

describe("each workspace looks back as far as its own question needs", () => {
  it("gives Control Tower the widest default, because governance is not about today", () => {
    /*
     * At 24 hours a quarterly batch integration reads as not observed. In the
     * Operations Center that is the right answer to "what moved today". In
     * Control Tower it invites somebody to revoke a healthy integration.
     */
    expect(DEFAULT_WINDOW_HOURS["control-tower"]).toBeGreaterThan(
      DEFAULT_WINDOW_HOURS["developer-studio"],
    );
    expect(DEFAULT_WINDOW_HOURS["developer-studio"]).toBeGreaterThan(
      DEFAULT_WINDOW_HOURS["operations-center"],
    );
  });

  it("offers only windows the control can actually select", () => {
    // A default outside OPS_WINDOWS renders as no button pressed, which reads
    // as a broken control rather than as a considered starting point.
    const offered = OPS_WINDOWS.map((w) => w.hours as number);
    for (const lens of ["developer-studio", "operations-center", "control-tower"] as const) {
      expect(offered).toContain(DEFAULT_WINDOW_HOURS[lens]);
    }
  });
});
