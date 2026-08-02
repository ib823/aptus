/**
 * The Console topology — what is wired to what, and what that can be said to mean.
 *
 * WHY THIS EXISTS. Solutions, interfaces, grants, credentials and connections
 * each have an authoritative screen, and every one of those screens is a list.
 * The RELATIONSHIPS between them are the one thing nothing shows: "which grant
 * authorises this interface, through which connection, under whose credential"
 * is reconstructed by hand today, across five screens.
 *
 * WHAT IT DELIBERATELY IS NOT. The Operations home says, in a comment older than
 * this file, that a fleet summary would be "a second copy of a number that
 * already has an authoritative source one click away, and a second copy is a
 * thing that disagrees". That argument holds and this module obeys it: the graph
 * carries STRUCTURE and PROVENANCE. Where it shows a state, that state is one
 * the data can actually support, and every node names what it cannot establish.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STATE VOCABULARY, and why `ended` is separate from it
 *
 * `state` says what has been OBSERVED. `ended` says whether anything further
 * will happen. They are independent, and collapsing them loses a real fact.
 *
 * A grant revoked yesterday that carried traffic for six months, and a grant
 * nobody ever used, are both inert. If both render as "never observed", the
 * first is a claim that no call ever ran under it — which the platform cannot
 * know and which is probably false. That is exactly the class of assertion the
 * vocabulary exists to prevent, so:
 *
 *   state:  observed-good | observed-bad | never-observed | unobservable | defect
 *   ended:  null | { kind, at, carried }
 *
 * `carried` is the load-bearing part: did anything actually run under this
 * before it ended? It is derived from the audit feed, which UNDER-REPORTS — so
 * `carried: false` means "no call was recorded", never "no call happened". The
 * provenance says so on every node that carries it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEFECT IS FOUR THINGS AND NOTHING ELSE
 *
 *   · a settled grant with no expiry        ("a defect, not a state")
 *   · a solution with an empty owner slot
 *   · an interface with no entity set
 *   · a connection with no declared environment
 *
 * A SANDBOX_ONLY decision on a PROD grant is NOT one of them, however wrong it
 * looks. The manual files it under "Things that look like bugs and are not":
 * the label is not the permission, and the refusal is the broker's own
 * predicates working. If DEFECT can mean correct behaviour it stops carrying
 * information, so that case gets `quiet` instead.
 */

/*
 * TYPE-ONLY, DELIBERATELY. This module is imported by the client component that
 * draws the graph, so a value import of `@prisma/client` would put the Prisma
 * runtime in a browser bundle. The decision names are compared as literals and
 * still typed against the enum, so renaming a member breaks the build here
 * rather than silently failing a comparison at run time.
 */
import type { $Enums } from "@prisma/client";

export type NodeKind =
  | "caller"
  | "credential"
  | "solution"
  | "grant"
  | "interface"
  | "connection"
  | "tenant";

export type NodeState =
  | "observed-good"
  | "observed-bad"
  | "never-observed"
  | "unobservable"
  | "defect";

export type EndedKind = "revoked" | "expired" | "rejected" | "superseded";

export interface Ended {
  kind: EndedKind;
  /** ISO timestamp. Rendered by the caller — this module never formats. */
  at: string;
  /**
   * Did the audit feed record a call under this before it ended?
   *
   * FALSE MEANS "NOT RECORDED", NOT "DID NOT HAPPEN". The feed is a floor:
   * calls throttled at the edge persist no record at all, and an audit write
   * can itself fail. Anything rendering this must say so.
   */
  carried: boolean;
  reason?: string;
}

/** What a node refuses to tell you. Never empty — every node owes one. */
export interface NodeProvenance {
  /** What the state was computed from. */
  derived: string;
  /** When the underlying observation was made. Null when there has been none. */
  observedAt: string | null;
  /** The thing a reader would otherwise assume this node establishes. */
  cannotTell: string;
  /**
   * Set when no incident rule watches this condition, and the reader would
   * reasonably expect one to. An absence with a reason, rather than silence.
   */
  noRule?: string;
}

export interface TopologyNode {
  id: string;
  kind: NodeKind;
  /**
   * Column 0–6, left to right, FOLLOWING THE DIRECTION OF A REQUEST.
   *
   *   caller → credential → solution → grant → interface → connection → SAP
   *
   * This is the order the broker itself resolves in: a call arrives bearing a
   * token, the token is a solution's runtime identity, the solution's grant
   * decides whether the operation is permitted, the interface says what shape
   * it takes, and only then is a connection bound and SAP reached.
   *
   * IT IS NOT THE DIRECTION THE DATA TRAVELS, which runs the other way, and
   * that ambiguity is real enough to have been raised. The request direction
   * wins because it is the one this product already names: the public surface
   * is the NORTHBOUND API "your app calls", so the app is the caller and SAP is
   * what answers. `BANDS` below writes that on the canvas rather than leaving a
   * reader to infer it from the ordering.
   */
  column: number;
  label: string;
  state: NodeState;
  ended: Ended | null;
  /**
   * Correct behaviour that reads as a fault. Rendered neutrally — never with
   * the defect treatment, and never with an attention animation.
   */
  quiet: boolean;
  /** A short badge, e.g. UNBOUNDED, REVOKED, AUTHORISES NOTHING. */
  badge: string | null;
  /** The authoritative screen for this node, in the ACTIVE lens's vocabulary. */
  href: string;
  provenance: NodeProvenance;
  /** Incident rule id, only when a real rule genuinely covers this node. */
  incidentId?: string;
}

/**
 * What the feed recorded along one edge.
 *
 * `mixed` earns its place. An edge where 900 calls succeeded and 100 were
 * refused is neither good nor bad, and rendering it as either is a claim: green
 * hides a hundred refusals, red says nothing got through. Both are wrong in a
 * way somebody would act on.
 */
export type EdgeObservation = "good" | "mixed" | "bad" | "never";

export interface TopologyEdge {
  from: string;
  to: string;
  /**
   * Calls recorded along this edge inside the window. Drives the replay
   * animation — motion means a RECORDED EVENT, never a heartbeat.
   *
   * A FLOOR, like everything derived from the feed. Rendered with a `≥`.
   */
  calls: number;
  /** Of those, the ones that returned 4xx or 5xx. */
  failures: number;
  observed: EdgeObservation;
  /** Either end ended, so nothing further will flow. Drawn inert. */
  inert: boolean;
}

/** Four states from two counts, with no rounding and no threshold to argue about. */
export function observeEdge(calls: number, failures: number): EdgeObservation {
  if (calls <= 0) return "never";
  if (failures <= 0) return "good";
  return failures >= calls ? "bad" : "mixed";
}

/* ───────────────────────────── derivation ───────────────────────────── */

/**
 * A settled grant is one that has been decided, either way.
 *
 * REQUESTED is the only decision that is not settled. `evaluateDecision`
 * refuses a granting decision with no expiry going forward, so an unbounded
 * settled grant can only be a row written before that rule — which is precisely
 * why the incident rule that watches for them exists.
 */
const SETTLED: ReadonlySet<$Enums.GrantDecision> = new Set([
  "APPROVED",
  "SANDBOX_ONLY",
  "READ_ONLY",
  "REJECTED",
  "EXPIRED",
]);

/** Decisions that confer no access at all, whatever else is true of the row. */
const CONFERS_NOTHING: ReadonlySet<$Enums.GrantDecision> = new Set([
  "REJECTED",
  "EXPIRED",
  "REQUESTED",
]);

export interface GrantInput {
  id: string;
  decision: $Enums.GrantDecision;
  environment: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  /** Calls recorded under this grant in the window. Under-reports; see Ended. */
  recordedCalls: number;
}

export interface DerivedGrant {
  state: NodeState;
  ended: Ended | null;
  quiet: boolean;
  badge: string | null;
  incidentId?: string;
}

/**
 * A grant's state, endedness and whether it is merely surprising.
 *
 * Order matters and is not arbitrary:
 *   1. UNBOUNDED first — it is a defect regardless of anything else, and the
 *      one condition here that means somebody must act.
 *   2. Revocation next, because it is a fact about this row rather than a
 *      property of its decision.
 *   3. Then the decision itself.
 */
export function deriveGrant(g: GrantInput, now: Date): DerivedGrant {
  const carried = g.recordedCalls > 0;
  const settled = SETTLED.has(g.decision);
  const confersAccess = !CONFERS_NOTHING.has(g.decision);

  // 1 · A settled grant that confers access and has no end date.
  if (settled && confersAccess && g.expiresAt == null && g.revokedAt == null) {
    return {
      state: "defect",
      ended: null,
      quiet: false,
      badge: "UNBOUNDED",
      incidentId: "unbounded-grant",
    };
  }

  // 2 · Revoked. The decision is untouched — revocation is a second, later
  //     fact recorded beside it, not a re-decision.
  if (g.revokedAt) {
    return {
      state: carried ? "observed-good" : "never-observed",
      ended: {
        kind: "revoked",
        at: g.revokedAt.toISOString(),
        carried,
        ...(g.revokedReason ? { reason: g.revokedReason } : {}),
      },
      quiet: false,
      badge: "REVOKED",
    };
  }

  // 3 · Lapsed, either by the enum or by the clock.
  const lapsed =
    g.decision === "EXPIRED" ||
    (g.expiresAt != null && g.expiresAt.getTime() <= now.getTime());
  if (lapsed) {
    return {
      state: carried ? "observed-good" : "never-observed",
      ended: { kind: "expired", at: (g.expiresAt ?? now).toISOString(), carried },
      quiet: false,
      badge: "EXPIRED",
    };
  }

  if (g.decision === "REJECTED") {
    // Rejected authorises nothing, so nothing can ever have run under it.
    return {
      state: "never-observed",
      ended: { kind: "rejected", at: now.toISOString(), carried: false },
      quiet: false,
      badge: "REJECTED",
    };
  }

  // 4 · SANDBOX_ONLY against a non-sandbox environment. The permission is the
  //     intersection, which is empty — correct, and surprising. Not a defect.
  if (
    g.decision === "SANDBOX_ONLY" &&
    g.environment.toUpperCase() !== "SANDBOX"
  ) {
    return {
      state: "never-observed",
      ended: null,
      quiet: true,
      badge: "AUTHORISES NOTHING",
    };
  }

  if (g.decision === "REQUESTED") {
    return { state: "never-observed", ended: null, quiet: false, badge: null };
  }

  return {
    state: carried ? "observed-good" : "never-observed",
    ended: null,
    quiet: false,
    badge: null,
  };
}

export interface ConnectionInput {
  environment: string | null;
  lastValidatedAt: Date | null;
  lastValidationStatus: string | null;
  isActive: boolean;
}

/**
 * A connection's state.
 *
 * A BLANK PROBE IS NOT HEALTH. `lastValidatedAt` moves only on a real success,
 * so a null means nobody has ever asked — which is a different thing from
 * asking and being answered. Undeclared environment outranks it, because that
 * is a standing defect while a missing probe is only an absence of information.
 */
export function deriveConnection(c: ConnectionInput): DerivedGrant {
  if (!c.environment) {
    return {
      state: "defect",
      ended: null,
      quiet: false,
      badge: "NO ENVIRONMENT",
      incidentId: "undeclared-environment",
    };
  }
  if (c.lastValidationStatus && c.lastValidationStatus.toUpperCase() !== "OK") {
    return {
      state: "observed-bad",
      ended: null,
      quiet: false,
      badge: c.lastValidationStatus.toUpperCase(),
      incidentId: "connection-unhealthy",
    };
  }
  if (c.lastValidatedAt == null) {
    return { state: "never-observed", ended: null, quiet: false, badge: null };
  }
  return { state: "observed-good", ended: null, quiet: false, badge: null };
}

/** Does this decision confer any access at all? Exported for the PROD test. */
export function grantConfersAccess(decision: $Enums.GrantDecision): boolean {
  return !CONFERS_NOTHING.has(decision);
}

export interface SolutionInput {
  /** How many of the three accountability slots are empty. */
  missingOwnerCount: number;
  /** Calls recorded under any grant on this solution, in the window. */
  recordedCalls: number;
  /**
   * Does it hold a live grant conferring PROD access?
   *
   * Load-bearing for the incident, not for the defect. See below.
   */
  holdsProdGrant: boolean;
}

export interface DerivedSolution extends DerivedGrant {
  noRule?: string;
}

/**
 * A solution's state.
 *
 * WHY IT IS ON THE CANVAS AT ALL. It owns the credential, the grants and the
 * interfaces, so a graph without it has no spine: a reader looking for their
 * application finds a token and a list of permissions and nothing that says
 * whose they are.
 *
 * AND IT CLOSES A HOLE. This module's header names four defect classes, one of
 * them "a solution with an empty owner slot" — which could never appear while
 * no solution node existed. A documented defect with no way to render is worse
 * than an undocumented one: it reads as an all-clear.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT IS WIDER THAN THE RULE, AND SAYS SO
 *
 * An empty owner slot is a defect wherever it occurs: the slot is who gets
 * called when this breaks, and an empty one means there is nobody to route an
 * incident to.
 *
 * The only rule that watches it — `unaccountable-prod-grant` — fires solely
 * when the unowned solution also holds a grant conferring PROD access. So an
 * unowned solution with nothing but sandbox access is a real defect that
 * NOTHING will page anyone about. Attaching the PROD rule to it anyway would be
 * the more comfortable lie and the more dangerous one: it would tell a reader
 * the condition is monitored when it is not.
 */
export function deriveSolution(s: SolutionInput): DerivedSolution {
  if (s.missingOwnerCount > 0) {
    const badge =
      s.missingOwnerCount === 1 ? "1 OWNER MISSING" : `${s.missingOwnerCount} OWNERS MISSING`;
    return s.holdsProdGrant
      ? { state: "defect", ended: null, quiet: false, badge, incidentId: "unaccountable-prod-grant" }
      : {
          state: "defect",
          ended: null,
          quiet: false,
          badge,
          noRule:
            "No incident rule watches this. `unaccountable-prod-grant` fires only where an unowned solution also holds PROD access; this one does not, so the empty owner slot is real and unmonitored.",
        };
  }
  return {
    state: s.recordedCalls > 0 ? "observed-good" : "never-observed",
    ended: null,
    quiet: false,
    badge: null,
  };
}

export interface CredentialInput {
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  isActive: boolean;
}

/**
 * A credential's state.
 *
 * `lastUsedAt` is written fire-and-forget and often does not land, so a blank
 * is an ABSENT OBSERVATION rather than an absent call. This never reports a
 * credential as unused; it reports that no use was observed, and the
 * provenance carries the difference.
 */
export function deriveCredential(c: CredentialInput, now: Date): DerivedGrant {
  const carried = c.lastUsedAt != null;

  if (c.revokedAt) {
    return {
      state: carried ? "observed-good" : "never-observed",
      ended: { kind: "revoked", at: c.revokedAt.toISOString(), carried },
      quiet: false,
      badge: "REVOKED",
    };
  }
  if (c.expiresAt && c.expiresAt.getTime() <= now.getTime()) {
    return {
      state: carried ? "observed-good" : "never-observed",
      ended: { kind: "expired", at: c.expiresAt.toISOString(), carried },
      quiet: false,
      badge: "EXPIRED",
    };
  }
  if (c.isActive && c.expiresAt == null) {
    return {
      state: "defect",
      ended: null,
      quiet: false,
      badge: "NO EXPIRY",
      incidentId: "credential-without-expiry",
    };
  }
  return {
    state: carried ? "observed-good" : "never-observed",
    ended: null,
    quiet: false,
    badge: null,
  };
}

/* ──────────────────────────── attribution ──────────────────────────── */

/**
 * One aggregated slice of the audit feed.
 *
 * `count` is however many rows the database folded into this combination — the
 * route groups rather than paging, because the feed is the largest table in the
 * product and the graph needs sums, not rows.
 */
export interface AuditSlice {
  solutionId: string;
  interfaceId: string | null;
  connectionId: string | null;
  /** The SolutionClient whose token was presented. Never null on a real row. */
  clientTokenId: string;
  externalId: string;
  operation: string;
  environment: string;
  status: number;
  count: number;
}

export interface Tally {
  calls: number;
  failures: number;
}

/**
 * Every count the graph can support, keyed by the thing it belongs to.
 *
 * WHY PAIRS AND NOT JUST NODES. A node count answers "how busy is this"; an
 * EDGE count answers "did these two actually talk". They are different
 * questions and only the second can be drawn as a line. Deriving edges from
 * node counts is what produced the bug this replaced: a grant with 400 recorded
 * calls and three credentials on its solution drew three 400-call edges, so one
 * call was rendered three times and two of the three pairings never happened.
 */
export interface Attribution {
  byCredential: Map<string, Tally>;
  bySolution: Map<string, Tally>;
  byGrant: Map<string, Tally>;
  byInterface: Map<string, Tally>;
  byConnection: Map<string, Tally>;
  /** `clientTokenId » solutionId` — an observed credential→solution pairing. */
  byCredentialSolution: Map<string, Tally>;
  /** `grantKey » interfaceId`. */
  byGrantInterface: Map<string, Tally>;
  /** `interfaceId » connectionId`. */
  byInterfaceConnection: Map<string, Tally>;
}

/**
 * The tuple an audit row shares with the grant that authorised it.
 *
 * THERE IS NO GRANT ID ON AN AUDIT ROW. A call records the solution, the
 * service, the operation and the environment; the grant is whichever row
 * matches. Where two grants overlap on that tuple the attribution is genuinely
 * ambiguous, and every grant node says so in its provenance rather than
 * presenting the count as settled.
 */
export function grantKey(
  solutionId: string,
  externalId: string,
  operation: string,
  environment: string,
): string {
  return `${solutionId}|${externalId}|${operation}|${environment}`.toUpperCase();
}

/** A pairing key. The separator cannot occur in a cuid or in a grant key. */
export function pairKey(a: string, b: string): string {
  return `${a}»${b}`;
}

function add(map: Map<string, Tally>, key: string, calls: number, failures: number): void {
  const t = map.get(key);
  if (t) {
    t.calls += calls;
    t.failures += failures;
  } else {
    map.set(key, { calls, failures });
  }
}

/** Zero, so a caller never has to branch on a missing key. */
export const NO_CALLS: Tally = Object.freeze({ calls: 0, failures: 0 });

export function tallyOf(map: Map<string, Tally>, key: string): Tally {
  return map.get(key) ?? NO_CALLS;
}

/**
 * Fold the aggregated feed into every count the graph draws.
 *
 * A REFUSAL IS A RECORDED CALL. A 403 means the broker was reached and said no,
 * which is a thing that happened along that edge — so it counts toward `calls`
 * and toward `failures`. What leaves no row at all is a call refused at the
 * throttle, before the audit boundary; that is the reason nothing here may be
 * presented as a total.
 */
export function attributeCalls(rows: readonly AuditSlice[]): Attribution {
  const a: Attribution = {
    byCredential: new Map(),
    bySolution: new Map(),
    byGrant: new Map(),
    byCredentialSolution: new Map(),
    byInterface: new Map(),
    byConnection: new Map(),
    byGrantInterface: new Map(),
    byInterfaceConnection: new Map(),
  };

  for (const row of rows) {
    const calls = row.count;
    const failures = row.status >= 400 ? row.count : 0;
    const gk = grantKey(row.solutionId, row.externalId, row.operation, row.environment);

    add(a.bySolution, row.solutionId, calls, failures);
    add(a.byGrant, gk, calls, failures);
    if (row.clientTokenId) {
      add(a.byCredential, row.clientTokenId, calls, failures);
      add(a.byCredentialSolution, pairKey(row.clientTokenId, row.solutionId), calls, failures);
    }
    if (row.interfaceId) {
      add(a.byInterface, row.interfaceId, calls, failures);
      add(a.byGrantInterface, pairKey(gk, row.interfaceId), calls, failures);
    }
    if (row.connectionId) {
      add(a.byConnection, row.connectionId, calls, failures);
      // Only a row that names BOTH ends is evidence that these two were wired
      // together on a real call. There is no schema link between an interface
      // and a connection — binding is resolved per call from the environment —
      // so an unobserved pairing is not a fact and is not drawn.
      if (row.interfaceId) {
        add(a.byInterfaceConnection, pairKey(row.interfaceId, row.connectionId), calls, failures);
      }
    }
  }

  return a;
}

/* ────────────────────────────── collapse ────────────────────────────── */

/** Above this many nodes in one column the graph is a hairball, not a map. */
export const COLLAPSE_THRESHOLD = 12;

export interface Collapsed {
  kept: TopologyNode[];
  /** How many were folded away. Zero when nothing was. */
  collapsedCount: number;
}

/**
 * Fold a column down to the nodes worth seeing, keeping the ones that need
 * action.
 *
 * SILENT TRUNCATION IS NEVER ACCEPTABLE — the caller renders `collapsedCount`
 * as a group node. Defects and ended-but-carried rows are kept first, because
 * those are the two categories somebody is looking for.
 */
export function collapseColumn(nodes: TopologyNode[], limit = COLLAPSE_THRESHOLD): Collapsed {
  if (nodes.length <= limit) return { kept: nodes, collapsedCount: 0 };
  const rank = (n: TopologyNode): number => {
    if (n.state === "defect") return 0;
    if (n.ended?.carried) return 1;
    if (n.state === "observed-bad") return 2;
    if (n.state === "observed-good") return 3;
    return 4;
  };
  const sorted = [...nodes].sort((a, b) => rank(a) - rank(b));
  return { kept: sorted.slice(0, limit), collapsedCount: nodes.length - limit };
}

/* ─────────────────────────────── lenses ─────────────────────────────── */

export type Lens = "developer-studio" | "operations-center" | "control-tower";

/**
 * The route a node links to, in the ACTIVE lens's own vocabulary.
 *
 * The same connection is "Connections" in Studio and Operations but "Connection
 * register" in Control Tower, and a credential is "Tokens" in Operations and
 * "Credential register" in Control Tower. Linking to the wrong workspace's
 * screen would take a reader out of the workspace they are working in.
 */
const ROUTES: Record<Lens, Partial<Record<NodeKind, string>>> = {
  "developer-studio": {
    credential: "/studio/solutions",
    solution: "/studio/solutions",
    grant: "/studio/access",
    interface: "/studio/interfaces",
    connection: "/studio/connections",
  },
  "operations-center": {
    caller: "/operations/traffic",
    credential: "/operations/tokens",
    // The Operations Center has no solution register of its own; the traffic
    // feed filtered by solution is the nearest authoritative screen it owns.
    solution: "/operations/traffic",
    grant: "/operations/traffic",
    interface: "/operations/traffic",
    connection: "/operations/connections",
  },
  "control-tower": {
    credential: "/control-tower/tokens",
    solution: "/control-tower/portfolio",
    grant: "/control-tower/grants",
    interface: "/control-tower/portfolio",
    connection: "/control-tower/connections",
  },
};

/** Where this node's authoritative screen is, for this lens. */
export function routeFor(lens: Lens, kind: NodeKind, fallback: string): string {
  return ROUTES[lens][kind] ?? fallback;
}

/**
 * How loudly the wiring is drawn, per lens.
 *
 * The three workspaces read the same graph for different questions, and only
 * one of them is about traffic. In the Operations Center the edges ARE the
 * subject. In Developer Studio they are context behind what is built, and
 * drawing them at full strength would put the busiest thing on screen in front
 * of the question the page is answering.
 */
export const EDGE_WEIGHT: Record<Lens, number> = {
  "developer-studio": 0.22,
  "operations-center": 1,
  "control-tower": 0.4,
};

/** Call counts and replay only where the page is asking about traffic. */
export function lensShowsTraffic(lens: Lens): boolean {
  return lens === "operations-center";
}

/* ─────────────────────────────── layout ─────────────────────────────── */

export const LAYOUT = {
  nodeW: 150,
  nodeH: 64,
  colGap: 34,
  rowGap: 16,
  /** Room above the first row for the column heading. */
  headerH: 26,
  /** Room above that again for the direction band. */
  bandH: 26,
} as const;

export const COLUMN_COUNT = 7;

/** The column headings, left to right. One per column, no gaps. */
export const COLUMN_LABELS: readonly string[] = [
  "Caller",
  "Credential",
  "Solution",
  "Grant",
  "Interface",
  "Connection",
  "SAP tenant",
];

export interface Band {
  /** Inclusive column range. */
  from: number;
  to: number;
  label: string;
  /** Shown on hover. Says what the band means and why it is called that. */
  note: string;
}

/**
 * The two halves of a call, named in the product's own words.
 *
 * NORTHBOUND IS REAL VOCABULARY HERE and southbound is not. The routes are
 * `/api/northbound/*`, the audit table is `NorthboundAuditEvent`, and the
 * developer guide calls it "the northbound API your app calls". Nothing in the
 * schema, the routes, the docs or the manual has ever said "southbound".
 *
 * Adding it for symmetry was the tempting move. It would have put a word on the
 * most-read diagram in the Console that appears nowhere else in the product —
 * teaching a reader a term they will never see again, and quietly making the
 * manual wrong by omission. The SAP-facing half is called what the resolver
 * calls it: binding.
 */
export const BANDS: readonly Band[] = [
  {
    from: 0,
    to: 4,
    label: "Northbound · the API your app calls",
    note: "Everything the broker resolves before it reaches SAP: the token presented, the solution it identifies, the grant that permits the operation and the interface that shapes it. A refusal anywhere here never touches a customer system.",
  },
  {
    from: 5,
    to: 6,
    label: "Bound to SAP",
    note: "Binding: the broker picks a connection for the caller's declared environment and makes the upstream call. The platform observes its own request and the answer it got — nothing about the SAP system itself.",
  },
];

export interface Point {
  x: number;
  y: number;
}

export interface TopologyLayout {
  width: number;
  height: number;
  /** Node id → top-left, in canvas coordinates. */
  positions: Map<string, Point>;
  /** Column → top-left of that column's "+n more" chip, when it has one. */
  chips: Map<number, Point>;
  /** Column → x. Used for the headings, which are not nodes. */
  columnX: number[];
}

/**
 * Place every node on a fixed grid.
 *
 * WHY NOT MEASURE THE DOM. Edges need coordinates, and reading them back from
 * laid-out elements means the first paint has nodes and no lines, then a second
 * with both. On a page that is trying to say "here is what is wired to what",
 * a frame where nothing is wired to anything is the worst possible first
 * impression. A pure function gives the same answer on the server and the
 * client, so the graph arrives whole — and it can be tested without a browser.
 *
 * Columns are centred against the tallest, so a lone caller sits level with the
 * middle of a column of twelve grants rather than at its top.
 */
export function layoutTopology(
  nodes: readonly TopologyNode[],
  collapsed: readonly { column: number; count: number }[] = [],
  opts: {
    nodeW: number;
    nodeH: number;
    colGap: number;
    rowGap: number;
    headerH: number;
    bandH: number;
  } = LAYOUT,
): TopologyLayout {
  const pitch = opts.nodeH + opts.rowGap;
  const perColumn: TopologyNode[][] = Array.from({ length: COLUMN_COUNT }, () => []);
  for (const n of nodes) {
    if (n.column >= 0 && n.column < COLUMN_COUNT) perColumn[n.column]!.push(n);
  }

  const hasChip = (c: number) => collapsed.some((x) => x.column === c && x.count > 0);
  const rows = perColumn.map((list, c) => list.length + (hasChip(c) ? 1 : 0));
  const maxRows = Math.max(1, ...rows);

  const positions = new Map<string, Point>();
  const chips = new Map<number, Point>();
  const columnX: number[] = [];

  perColumn.forEach((list, c) => {
    const x = c * (opts.nodeW + opts.colGap);
    columnX.push(x);
    const top = opts.bandH + opts.headerH + ((maxRows - rows[c]!) * pitch) / 2;
    list.forEach((n, i) => positions.set(n.id, { x, y: top + i * pitch }));
    if (hasChip(c)) chips.set(c, { x, y: top + list.length * pitch });
  });

  return {
    width: COLUMN_COUNT * opts.nodeW + (COLUMN_COUNT - 1) * opts.colGap,
    height: opts.bandH + opts.headerH + maxRows * pitch - opts.rowGap,
    positions,
    chips,
    columnX,
  };
}

/** Where a band sits on the canvas, spanning its columns end to end. */
export function bandExtent(
  band: Band,
  layout: TopologyLayout,
  nodeW: number = LAYOUT.nodeW,
): { x: number; width: number } {
  const x = layout.columnX[band.from] ?? 0;
  const right = (layout.columnX[band.to] ?? x) + nodeW;
  return { x, width: right - x };
}

/**
 * An orthogonal connector with rounded corners: out, across, down, in.
 *
 * Orthogonal rather than a curve because the columns are a sequence and the
 * eye should read left-to-right along them. A bundle of beziers between two
 * dense columns turns into a moiré; right angles stay legible.
 */
export function orthoPath(x1: number, y1: number, x2: number, y2: number, r = 8): string {
  if (Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const mx = Math.round((x1 + x2) / 2);
  const s = y2 > y1 ? 1 : -1;
  // Never let the corner radius exceed half the run it has to turn inside.
  const rr = Math.min(r, Math.abs(y2 - y1) / 2, Math.abs(mx - x1), Math.abs(x2 - mx));
  return (
    `M ${x1} ${y1} L ${mx - rr} ${y1} Q ${mx} ${y1} ${mx} ${y1 + s * rr} ` +
    `L ${mx} ${y2 - s * rr} Q ${mx} ${y2} ${mx + rr} ${y2} L ${x2} ${y2}`
  );
}

/**
 * How many pulses to replay for a recorded call count.
 *
 * LOGARITHMIC, AND CAPPED, because this is a legibility device and not a
 * measurement. One pulse per call would be unreadable at any real volume and
 * would also imply the count is exact, which it never is — the number beside
 * the edge carries a `≥` for that reason. The floor of one matters: an edge
 * that carried anything at all must visibly carry something.
 */
export function pulseCount(calls: number): number {
  if (calls <= 0) return 0;
  return Math.min(8, Math.max(1, Math.round(Math.log10(calls + 1) * 3)));
}
