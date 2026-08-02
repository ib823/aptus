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

import { $Enums } from "@prisma/client";

export type NodeKind =
  | "caller"
  | "credential"
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
  /** Column 0–5, left to right, following the direction of a request. */
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

export interface TopologyEdge {
  from: string;
  to: string;
  /**
   * Calls recorded along this edge inside the window. Drives the replay
   * animation — motion means a RECORDED EVENT, never a heartbeat.
   */
  calls: number;
  /** Either end ended, so nothing further will flow. Drawn inert. */
  inert: boolean;
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
  $Enums.GrantDecision.APPROVED,
  $Enums.GrantDecision.SANDBOX_ONLY,
  $Enums.GrantDecision.READ_ONLY,
  $Enums.GrantDecision.REJECTED,
  $Enums.GrantDecision.EXPIRED,
]);

/** Decisions that confer no access at all, whatever else is true of the row. */
const CONFERS_NOTHING: ReadonlySet<$Enums.GrantDecision> = new Set([
  $Enums.GrantDecision.REJECTED,
  $Enums.GrantDecision.EXPIRED,
  $Enums.GrantDecision.REQUESTED,
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
    g.decision === $Enums.GrantDecision.EXPIRED ||
    (g.expiresAt != null && g.expiresAt.getTime() <= now.getTime());
  if (lapsed) {
    return {
      state: carried ? "observed-good" : "never-observed",
      ended: { kind: "expired", at: (g.expiresAt ?? now).toISOString(), carried },
      quiet: false,
      badge: "EXPIRED",
    };
  }

  if (g.decision === $Enums.GrantDecision.REJECTED) {
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
    g.decision === $Enums.GrantDecision.SANDBOX_ONLY &&
    g.environment.toUpperCase() !== "SANDBOX"
  ) {
    return {
      state: "never-observed",
      ended: null,
      quiet: true,
      badge: "AUTHORISES NOTHING",
    };
  }

  if (g.decision === $Enums.GrantDecision.REQUESTED) {
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
    grant: "/studio/access",
    interface: "/studio/interfaces",
    connection: "/studio/connections",
  },
  "operations-center": {
    caller: "/operations/traffic",
    credential: "/operations/tokens",
    grant: "/operations/traffic",
    interface: "/operations/traffic",
    connection: "/operations/connections",
  },
  "control-tower": {
    credential: "/control-tower/tokens",
    grant: "/control-tower/grants",
    interface: "/control-tower/portfolio",
    connection: "/control-tower/connections",
  },
};

/** Where this node's authoritative screen is, for this lens. */
export function routeFor(lens: Lens, kind: NodeKind, fallback: string): string {
  return ROUTES[lens][kind] ?? fallback;
}
