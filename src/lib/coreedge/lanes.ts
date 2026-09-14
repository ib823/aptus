/**
 * A lane, derived.
 *
 * A lane is one app × one data feed × one environment. It is NOT a table and
 * must never become one: every fact it reports already lives somewhere else —
 * in a SolutionClient, an ApiAccessGrant, a SapConnection, a probe event — and a
 * lane row would be a cached opinion about those, wrong the moment any of them
 * changes. The whole point of the status vocabulary is that a lane says what is
 * true right now.
 *
 * THE SIX HOPS, and the order is the argument: Key → Access → Binding → SAP
 * metadata → SAP data read → App. The FIRST hop that fails decides the status,
 * because that is the one a person has to fix; everything after it was never
 * attempted, and reporting those as failures would blame five systems for one
 * problem.
 *
 * WHAT THIS FILE WILL NOT DO. Seven of the eighteen statuses have no backend
 * behind them yet (see status-vocabulary.ts and PR-5): rate limiting, the
 * circuit breaker, deliberate deactivation, the binding rules and the key
 * lifecycle behind "No key". Where a hop cannot be PROVEN, this returns
 * `unknown` — "no check within 24 h, a claim about us, not the lane" — rather
 * than inventing a green. A console that guesses Live is worse than one that
 * admits it does not know, because the guess is indistinguishable from evidence.
 */

import { LANE_PROOF_TTL_MS } from "./freshness";

import { LANE_HOPS, type LaneHop, type LaneStatus } from "./status-vocabulary";

/* ─────────────────────────────────────────────────────────────────────────────
 * Environments
 *
 * `SapConnection.environment`, `SolutionClient.environment` and
 * `ApiAccessGrant.environment` are all free-text columns on this branch, written
 * by different code paths over time. Comparing them raw is how "prod" and "PROD"
 * become two different environments and a lane silently matches nothing.
 * ────────────────────────────────────────────────────────────────────────── */

export const LANE_ENVIRONMENTS = ["SANDBOX", "DEV", "TEST", "PROD"] as const;
export type LaneEnvironment = (typeof LANE_ENVIRONMENTS)[number];

const ENVIRONMENT_ALIASES: Readonly<Record<string, LaneEnvironment>> = {
  SANDBOX: "SANDBOX",
  SBX: "SANDBOX",
  DEV: "DEV",
  DEVELOPMENT: "DEV",
  TEST: "TEST",
  QA: "TEST",
  QAS: "TEST",
  PROD: "PROD",
  PRD: "PROD",
  PRODUCTION: "PROD",
};

/**
 * Returns null for anything unrecognised rather than guessing. An environment
 * nobody can name is not a lane, and rendering it as one would put a chip on a
 * row whose identity we do not actually know.
 */
export function parseLaneEnvironment(value: string | null | undefined): LaneEnvironment | null {
  if (value === null || value === undefined) return null;
  return ENVIRONMENT_ALIASES[value.trim().toUpperCase()] ?? null;
}

export const ENVIRONMENT_LABELS: Readonly<Record<LaneEnvironment, string>> = {
  SANDBOX: "Sandbox",
  DEV: "Dev",
  TEST: "Test",
  PROD: "Prod",
};

/* ─────────────────────────────────────────────────────────────────────────────
 * The inputs
 *
 * Plain data, not Prisma rows. The derivation is then a pure function that a
 * test can drive through all eighteen statuses without a database, which is what
 * makes it testable at all — and the screens pass real rows in.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * How stale a check may be before the lane admits it does not know.
 *
 * RE-EXPORTED, NOT REDECLARED. This was a second 24-hour literal sitting beside
 * LANE_PROOF_TTL_MS in freshness.ts — two constants for one rule, which is one
 * edit away from a lane that fades at 24 h while its age renders against 48.
 * The definition lives with the other freshness rules; this name stays so the
 * derivation reads in its own vocabulary.
 */
export const CHECK_TTL_MS = LANE_PROOF_TTL_MS;

export interface KeyFacts {
  readonly exists: boolean;
  readonly isActive: boolean;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date | null;
}

export interface AccessFacts {
  /** The grant's decision, or null when no grant exists for this lane at all. */
  readonly decision:
    | "REQUESTED"
    | "APPROVED"
    | "SANDBOX_ONLY"
    | "READ_ONLY"
    | "REJECTED"
    | "EXPIRED"
    | "REVOKED"
    | null;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface BindingFacts {
  /** Active SapConnections whose environment parses to this lane's. */
  readonly matchingConnections: number;
  /** True when a connection exists but CoreEdge cannot decrypt its secret. */
  readonly secretUnreadable: boolean;
}

export interface ProbeFacts {
  /** The last probe's status, or null when none has ever run. */
  readonly status: "OK" | "UNAUTHORIZED" | "NOT_FOUND" | "TIMEOUT" | "ERROR" | "NO_PROBE_PATH" | null;
  readonly at: Date | null;
}

export interface ReadFacts {
  /** The last proven read, or null when none has ever succeeded. */
  readonly outcome: "OK" | "EMPTY" | "FORBIDDEN" | "TIMEOUT" | "ERROR" | null;
  readonly at: Date | null;
  readonly rows: number | null;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Why no check stands behind a lane
 *
 * "Never checked" was one phrase doing six jobs. A lane nobody has requested, a
 * lane whose app is still a draft, a lane whose feed has no dataset chosen, a
 * lane with no SAP system in that environment, a lane whose system's secret
 * would not open, and a lane the nightly sweep simply has not reached yet all
 * rendered the identical words — so a board of twenty lanes reading "never
 * checked" told an operator nothing about which of the six they were looking at,
 * and nothing about whether anyone was ever going to check.
 *
 * FIVE OF THE SIX ARE NOT THE SWEEP'S FAULT AND NOT ITS JOB. `laneTargets()`
 * selects ACTIVE apps with a feed that names an entity set, in an environment
 * where an active connection exists. Every exclusion there is deliberate: there
 * is no read to attempt for a feed with no dataset, nothing to ask when no
 * system is connected, and a draft app's unfinished work does not belong in a
 * fleet-wide nightly read of a client's SAP system. The fix is to SAY WHICH,
 * not to widen the target set until the board looks greener.
 *
 * THE SIXTH IS A REAL GAP AND IS NAMED AS ONE. `secretWouldNotOpen` is a lane
 * the sweep reached, failed on, and recorded only as a fleet-wide count — see
 * the `unreadable` tally in lane-check-sweep.ts. It is reported here where a
 * screen knows it, and the count is on the Operations board; there is still no
 * per-lane ledger row behind it, which is stated rather than papered over.
 * ────────────────────────────────────────────────────────────────────────── */

export const UNCHECKED_REASONS = [
  "nothingRequested",
  "appNotLive",
  "feedHasNoDataset",
  "noSapSystemHere",
  "secretWouldNotOpen",
  "notRunYet",
] as const;

export type UncheckedReason = (typeof UNCHECKED_REASONS)[number];

/**
 * What the nightly sweep would do with this lane, as the screens know it.
 *
 * Two facts, both already on the row a screen has loaded, and both mirroring a
 * filter in `laneTargets()` exactly. They are separate from the hop facts
 * because they decide nothing about the STATUS — a draft app's lane is still
 * "No key" if it has no key. They decide only whether a check was ever coming.
 */
export interface SweepFacts {
  /** False for a draft, restricted or retired app: `laneTargets` takes ACTIVE only. */
  readonly appIsActive: boolean;
  /** False when the feed names no entity set, so there is no read to attempt. */
  readonly feedHasDataset: boolean;
}

export interface LaneFacts {
  readonly appRetired: boolean;
  readonly key: KeyFacts;
  readonly access: AccessFacts;
  readonly binding: BindingFacts;
  readonly probe: ProbeFacts;
  readonly read: ReadFacts;
  readonly sweep: SweepFacts;
  readonly now?: Date;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Which hop proved, which broke, and which was never reached
 *
 * THE STRIP CONTRADICTED THE CHIP, and the cause is two orders. `LANE_HOPS` is
 * the order a CALL travels — Key → Access → Binding → SAP metadata → SAP data
 * read → App — and it is the right order to draw. The derivation below asks in
 * a different order, and says why: access is resolved BEFORE key, because a
 * lane with no approved access has nothing to collect a key for.
 *
 * Deriving the strip from the broken hop's position in the DISPLAY order threw
 * that away. A "No key" lane marked Key broken and then, reading left to right,
 * Access "not reached" — on a lane whose chip says access is approved. Access
 * had been proven; it was simply proven first.
 *
 * So the states are resolved here, against the order the derivation actually
 * walks, and travel on the verdict. One object now answers both "what is the
 * status" and "what did we establish", and they cannot disagree.
 * ────────────────────────────────────────────────────────────────────────── */

export type LaneHopState = "ok" | "broken" | "unreached" | "unknown";

export interface LaneHopVerdict {
  readonly hop: LaneHop;
  readonly state: LaneHopState;
}

/**
 * The order the derivation asks in — NOT the order a strip draws in.
 *
 * Access first: see the "Hop 2 before hop 1, deliberately" note in
 * `deriveHopVerdict`. Keeping the two orders as separate named constants is
 * what stops the next edit from collapsing them again.
 */
const EVALUATION_ORDER: readonly LaneHop[] = [
  "access",
  "key",
  "binding",
  "sapMetadata",
  "sapDataRead",
  "app",
];

function hopVerdicts(facts: LaneFacts, brokenHop: LaneHop | null): readonly LaneHopVerdict[] {
  /*
   * A RETIRED APP SHORT-CIRCUITS BEFORE ANY HOP IS EXAMINED. Nothing was
   * established about access, binding or SAP, so nothing claims to have been:
   * `unknown`, not `ok` and not `unreached`. "We never asked" is its own answer.
   */
  if (facts.appRetired) {
    return LANE_HOPS.map((hop) => ({
      hop,
      state: hop === "key" ? ("broken" as const) : ("unknown" as const),
    }));
  }
  if (brokenHop === null) {
    return LANE_HOPS.map((hop) => ({ hop, state: "ok" as const }));
  }
  const brokenAt = EVALUATION_ORDER.indexOf(brokenHop);
  return LANE_HOPS.map((hop) => {
    const at = EVALUATION_ORDER.indexOf(hop);
    return {
      hop,
      state: at < brokenAt ? ("ok" as const) : at === brokenAt ? ("broken" as const) : ("unreached" as const),
    };
  });
}

export interface LaneVerdict {
  readonly status: LaneStatus;
  /** The hop that decided it, or null when nothing failed. */
  readonly brokenHop: LaneHop | null;
  /**
   * Why this status and not another, in one sentence, for the trace and for
   * anyone reading a screenshot six months from now.
   */
  readonly because: string;
  /** When the evidence behind this verdict was gathered. */
  readonly checkedAt: Date | null;
  /**
   * Why there is no evidence, when there is none. Non-null exactly when
   * `checkedAt` is null, so a screen can never render an absence as a bare
   * "never checked" — it always has the reason to hand.
   */
  readonly unchecked: UncheckedReason | null;
  /**
   * The six hops as the derivation established them, in DISPLAY order, ready
   * for a gate strip. Derived from the same walk as `status`, so a strip and a
   * chip drawn from one verdict cannot contradict each other.
   */
  readonly hops: readonly LaneHopVerdict[];
}

/** The verdict before the reason is attached — see `deriveLaneStatus`. */
type HopVerdict = Omit<LaneVerdict, "unchecked" | "hops">;

function isStale(at: Date | null, now: Date): boolean {
  return at === null || now.getTime() - at.getTime() > CHECK_TTL_MS;
}

/**
 * Walk the hops and return the first failure — the status half of the verdict.
 *
 * Read top to bottom: the order of the checks IS the order of the hops, and the
 * first failure returns. Nothing below a failed hop is consulted, because
 * nothing below it was attempted.
 *
 * Not exported: `deriveLaneStatus` is the entry point, and it attaches the
 * unchecked reason so no caller can obtain a verdict missing one.
 */
function deriveHopVerdict(facts: LaneFacts): HopVerdict {
  const now = facts.now ?? new Date();

  /* ── Hop 0: the app itself ────────────────────────────────────────────── */
  if (facts.appRetired) {
    return {
      status: "keyNotValid",
      brokenHop: "key",
      because: "The app is retired, so northbound refuses every call with its key.",
      checkedAt: null,
    };
  }

  /* ── Hop 2 before hop 1, deliberately: ACCESS ─────────────────────────────
   *
   * A lane with no approved access has nothing to collect a key FOR, so
   * reporting "No key" first would send the user to fetch something they cannot
   * yet be given. The handoff's own lane table agrees: No key means "access
   * approved, no key collected". Access is therefore the first question even
   * though Key is the first hop a CALL travels.
   */
  const { access } = facts;
  if (access.decision === null) {
    return {
      status: "noAccess",
      brokenHop: "access",
      because: "No access has been requested for this data feed in this environment.",
      checkedAt: null,
    };
  }
  if (access.decision === "REQUESTED") {
    return {
      status: "inReview",
      brokenHop: "access",
      because: "Access was requested and a reviewer has not decided yet.",
      checkedAt: null,
    };
  }
  if (access.decision === "REJECTED") {
    return {
      status: "noAccess",
      brokenHop: "access",
      because: "A reviewer declined this access request.",
      checkedAt: null,
    };
  }
  if (access.decision === "REVOKED" || access.revokedAt !== null) {
    return {
      status: "noAccess",
      brokenHop: "access",
      because: "Access was withdrawn. Unlike an expiry, there is nothing to renew.",
      checkedAt: null,
    };
  }
  if (access.decision === "EXPIRED" || (access.expiresAt !== null && access.expiresAt <= now)) {
    return {
      status: "accessEnded",
      brokenHop: "access",
      because: "Access reached its end date. The key survives; renewing keeps it.",
      checkedAt: null,
    };
  }

  /* ── Hop 1: KEY ───────────────────────────────────────────────────────── */
  const { key } = facts;
  if (!key.exists) {
    return {
      status: "noKey",
      brokenHop: "key",
      because: "Access is approved but no key has been collected for this environment.",
      checkedAt: null,
    };
  }
  if (key.revokedAt !== null) {
    return {
      status: "keyNotValid",
      brokenHop: "key",
      because: "The key for this environment was revoked.",
      checkedAt: null,
    };
  }
  if (key.expiresAt !== null && key.expiresAt <= now) {
    return {
      status: "keyNotValid",
      brokenHop: "key",
      because: "The key for this environment has expired.",
      checkedAt: null,
    };
  }
  if (!key.isActive) {
    return {
      status: "keyNotValid",
      brokenHop: "key",
      because: "The key for this environment is not active.",
      checkedAt: null,
    };
  }

  /* ── Hop 3: BINDING ───────────────────────────────────────────────────── */
  const { binding } = facts;
  if (binding.secretUnreadable) {
    return {
      status: "secretUnreadable",
      brokenHop: "binding",
      because: "CoreEdge cannot decrypt the SAP system's stored secret. Our fault, not SAP's.",
      checkedAt: null,
    };
  }
  if (binding.matchingConnections === 0) {
    return {
      status: "noSapSystem",
      brokenHop: "binding",
      because: "No SAP system is connected for this environment.",
      checkedAt: null,
    };
  }
  if (binding.matchingConnections > 1) {
    return {
      status: "bindingRefused",
      brokenHop: "binding",
      because: "Two SAP systems claim this environment, and CoreEdge will not choose between them.",
      checkedAt: null,
    };
  }

  /* ── Hop 4: SAP METADATA ──────────────────────────────────────────────── */
  const { probe } = facts;
  if (probe.status === "UNAUTHORIZED") {
    return {
      status: "signInRefused",
      brokenHop: "sapMetadata",
      because: "SAP rejected CoreEdge's sign-in. Every lane on this system stops.",
      checkedAt: probe.at,
    };
  }
  if (probe.status === "TIMEOUT" || probe.status === "ERROR") {
    return {
      status: "sapUnavailable",
      brokenHop: "sapMetadata",
      because: "The SAP system did not answer. Nothing was refused.",
      checkedAt: probe.at,
    };
  }
  if (probe.status === null || probe.status === "NO_PROBE_PATH" || isStale(probe.at, now)) {
    return {
      status: "unknown",
      brokenHop: null,
      because:
        probe.status === null
          ? "No check has ever run for this SAP system."
          : "The last check is more than 24 hours old.",
      checkedAt: probe.at,
    };
  }

  /* ── Hop 5: SAP DATA READ ─────────────────────────────────────────────── */
  const { read } = facts;
  if (read.outcome === "FORBIDDEN") {
    return {
      status: "sapRefused",
      brokenHop: "sapDataRead",
      because: "We signed in and SAP refused this dataset. The fix is in SAP, not in CoreEdge.",
      checkedAt: read.at,
    };
  }
  if (read.outcome === "TIMEOUT" || read.outcome === "ERROR") {
    return {
      status: "sapUnavailable",
      brokenHop: "sapDataRead",
      because: "The read timed out or errored. Nothing was refused.",
      checkedAt: read.at,
    };
  }
  if (read.outcome === null || isStale(read.at, now)) {
    /*
     * THE HONEST ANSWER, and the one that matters most. Metadata answering 200
     * proves the service is reachable; it does not prove a read will succeed —
     * a 403 on the entity set is the single most common failure in this system.
     * Promoting a green probe to Live is exactly the overclaim the lane model
     * exists to prevent.
     */
    return {
      status: "unknown",
      brokenHop: null,
      because:
        read.outcome === null
          ? "Metadata is reachable, but no read has been proven. Reachable is not the same as readable."
          : "The last proven read is more than 24 hours old.",
      checkedAt: read.at,
    };
  }
  if (read.outcome === "EMPTY") {
    return {
      status: "noData",
      brokenHop: null,
      because: "SAP answered successfully and had nothing to return. This is a success.",
      checkedAt: read.at,
    };
  }

  /* ── Hop 6: the app. Everything proved. ───────────────────────────────── */
  return {
    status: "live",
    brokenHop: null,
    because: "Every hop proved, most recently at the time shown.",
    checkedAt: read.at,
  };
}

/**
 * The first reason a check is not standing behind this lane, in the sweep's own
 * order.
 *
 * ORDERED AS `laneTargets()` FILTERS, deliberately. A draft app whose
 * environment also has no SAP system fails the app filter first, so that is
 * what a person has to change first; reporting the missing system would send
 * them to connect one for an app that still would not be checked.
 * `secretWouldNotOpen` comes first of all because it is the only one of the six
 * where the sweep did reach the lane — an answer, not an exclusion.
 */
function whyUnchecked(facts: LaneFacts): UncheckedReason {
  if (facts.binding.secretUnreadable) return "secretWouldNotOpen";
  if (!facts.sweep.appIsActive) return "appNotLive";
  if (!facts.sweep.feedHasDataset) return "feedHasNoDataset";
  if (facts.binding.matchingConnections === 0) return "noSapSystemHere";
  return "notRunYet";
}

/**
 * Resolve a lane to exactly one of the eighteen statuses, and — where no check
 * stands behind it — to why not.
 *
 * The two are computed separately on purpose. The status answers "what is true
 * of this lane"; the reason answers "why do we not know", and the second must
 * never be allowed to change the first. A draft app with no key reads "No key",
 * exactly as an ACTIVE one would; it just also says that no check was coming.
 */
export function deriveLaneStatus(facts: LaneFacts): LaneVerdict {
  const verdict = deriveHopVerdict(facts);
  return {
    ...verdict,
    unchecked: verdict.checkedAt === null ? whyUnchecked(facts) : null,
    hops: hopVerdicts(facts, verdict.brokenHop),
  };
}

/**
 * A lane that has never been started at all — no grant, no key, nothing
 * requested. Distinct from `noAccess`, which means someone asked and the answer
 * was no or has not come.
 */
export function notStartedVerdict(): LaneVerdict {
  return {
    status: "notStarted",
    brokenHop: null,
    because: "Nothing has been requested for this environment yet.",
    checkedAt: null,
    unchecked: "nothingRequested",
    // Nothing requested is not a failure, so no hop is marked broken.
    hops: LANE_HOPS.map((hop) => ({ hop, state: "ok" as const })),
  };
}
