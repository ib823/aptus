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

import type {
  AccessRefusal,
  BrokerRoute,
  WriteSwitchRefusal,
} from "@/lib/northbound/authorisation";
import { keyRefusal } from "@/lib/northbound/key-policy";
import type { ConnectionBindingFailure } from "@/lib/sap-public/connection-selection";
import { isWriteOperation, type GrantOperation } from "@/lib/studio/grants";

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
 * The app statuses whose lanes the nightly sweep checks: the ones that carry
 * traffic. RESTRICTED is among them (wave 1a integration review): an ACTIVE
 * app the owner sweep restricts because an owner left keeps every key and
 * every call (DECISION D3), so leaving it out stopped the health checks of a
 * live integration the night its owner was found gone. `laneTargets` filters
 * on this list and the board's `appIsActive` mirrors it, so the two cannot
 * drift.
 */
export const LANE_CHECKED_APP_STATUSES = ["ACTIVE", "RESTRICTED"] as const;

/** Does the sweep check this app's lanes? */
export function isLaneCheckedApp(status: string): boolean {
  return (LANE_CHECKED_APP_STATUSES as readonly string[]).includes(status);
}

/**
 * Returns null for anything unrecognised rather than guessing. An environment
 * nobody can name is not a lane, and rendering it as one would put a chip on a
 * row whose identity we do not actually know.
 */
export function parseLaneEnvironment(value: string | null | undefined): LaneEnvironment | null {
  if (value === null || value === undefined) return null;
  return ENVIRONMENT_ALIASES[value.trim().toUpperCase()] ?? null;
}

/**
 * Every spelling that parses to `environment`, upper-cased — the inverse of
 * `parseLaneEnvironment`, for a query that must match the free-text column in
 * SQL. Compared case-insensitively, these select the rows the parser accepts,
 * so a WHERE built from them does not reopen the "prod" / "PROD" split the
 * parser exists to close. The one step SQL equality does not mirror is the
 * parser's trim; a credential's environment is written from the
 * `ClientEnvironment` union, which carries no padding.
 */
export function laneEnvironmentAliases(environment: LaneEnvironment): readonly string[] {
  return Object.keys(ENVIRONMENT_ALIASES).filter((alias) => ENVIRONMENT_ALIASES[alias] === environment);
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
  /**
   * A write key is sealed on the credential row. Only asked of a lane that
   * writes: the write route refuses every call without one (it verifies the
   * presented key against this one, and there is none to match).
   */
  readonly writeKeyIssued: boolean;
  /**
   * The issued write key will not open — sealed under a data key that is gone,
   * or corrupt. The write route opens it on every call and refuses the write,
   * so a lane that writes is refused at the key exactly as if none were
   * issued. Absent means it was not found unopenable.
   */
  readonly writeKeyUnopenable?: boolean;
}

export interface AccessFacts {
  /**
   * The CURRENT grant's decision — the most recent one fetched for this lane —
   * or null when none exists. For the WORDS only: whether access holds is
   * `refusal`, the broker's own answer, which weighs every grant and not just
   * the newest (a pending renewal beside a live approval is live access).
   */
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
  /**
   * THE BROKER'S ANSWER (P0.2): authorisation.ts `authorisesHere` on this
   * lane's interface and grants, in the credential's environment, under the
   * deployment's grant-binding mode. Null when it authorises the lane.
   */
  readonly refusal: AccessRefusal | null;
}

/** Why the broker would not bind a call on this lane to one SAP system. */
export type LaneBindingRefusal = ConnectionBindingFailure | WriteSwitchRefusal;

export interface BindingFacts {
  /**
   * THE BROKER'S ANSWER (P0.2): authorisation.ts `bindingFor` on the
   * organisation's connections for the feed's product, in the credential's
   * environment, with its SAP client — then, for a lane that writes, the
   * write route's own gates on that connection (`writeSwitchRefusal`). Null
   * when the call would go through exactly one connection.
   *
   * It replaced a count of the organisation's connections in this
   * environment, which ignored the product and the SAP client the broker
   * binds on (A15).
   */
  readonly refusal: LaneBindingRefusal | null;
}

export interface ProbeFacts {
  /** The last probe's status, or null when none has ever run. */
  readonly status: "OK" | "UNAUTHORIZED" | "NOT_FOUND" | "TIMEOUT" | "ERROR" | "NO_PROBE_PATH" | null;
  readonly at: Date | null;
}

/**
 * Every read status the ledger writes (lane-check-sweep.ts
 * `ledgerReadStatus`), and the reader narrows to exactly these. NOT_FOUND and
 * UNAUTHORIZED were written and then dropped by the reader, so an observed
 * 404 or 401 read as "no read has been proven" (A17).
 */
export const LEDGER_READ_STATUSES = ["OK", "EMPTY", "FORBIDDEN", "NOT_FOUND", "UNAUTHORIZED", "TIMEOUT", "ERROR"] as const;

export interface ReadFacts {
  /** The last read's outcome, or null when none has ever run. */
  readonly outcome: (typeof LEDGER_READ_STATUSES)[number] | null;
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
  /*
   * A SEVENTH, added with the sweep's service resolution. The sweep reads the
   * path the broker would call; a feed whose service the broker cannot resolve
   * (an unsupported product, a catalogue id with no OData path) is refused by
   * the broker on every call and skipped by the sweep. Without its own words it
   * fell through to `notRunYet` — "the check has not reached this lane", which
   * is false: it reached it and had nothing it could honestly ask.
   */
  "feedServiceUnresolved",
  "secretWouldNotOpen",
  /*
   * TWO MORE WITH P0.2. The sweep no longer reads SAP for a lane the broker
   * refuses on access — it was making fresh "OK" evidence for lanes nobody
   * may call (A14) — so such a lane is outside the sweep on purpose, and says
   * so. And evidence is now tied to the connection, dataset and feed version
   * that produced it (A18): a check made before any of them changed proves
   * nothing about the lane today, and the lane says that rather than "never".
   */
  "accessRefused",
  /*
   * TWO MORE WITH P0.2's review. A write lane refused at its write gates —
   * writes switched off on the connection, or the feed's own service not yet
   * verified through it — is refused by a SETTING, which no check decides;
   * it read "not checked since it changed" although nothing had. And a check
   * written before checks recorded what they proved is set aside without
   * anything having changed either, so it says that instead.
   */
  "refusedBySetting",
  "checkPredatesEvidenceKey",
  "changedSinceCheck",
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
  /**
   * False for a draft or retired app: `laneTargets` takes the statuses that
   * carry traffic only (`isLaneCheckedApp`: ACTIVE and RESTRICTED).
   */
  readonly appIsActive: boolean;
  /** False when the feed names no entity set, so there is no read to attempt. */
  readonly feedHasDataset: boolean;
  /**
   * False when the broker cannot resolve the feed's service for its product —
   * `resolveLaneServicePath`, the same call the sweep makes before it reads.
   */
  readonly feedServiceResolves: boolean;
}

/**
 * Which lane this is: the feed's operation and the environment it runs in.
 *
 * The Access hop cannot be answered without it. A decision is not access on its
 * own — the broker asks whether it authorises THIS operation in THIS
 * environment (`grantsRead`/`grantsWrite`), and READ_ONLY or SANDBOX_ONLY can
 * be a live, unexpired grant that permits nothing on a given lane.
 */
export interface LaneIdentity {
  readonly operation: GrantOperation;
  readonly environment: LaneEnvironment;
  /** The northbound route its calls take (authorisation.ts `routeOf`). */
  readonly route: BrokerRoute;
}

export interface LaneFacts {
  readonly lane: LaneIdentity;
  readonly appRetired: boolean;
  readonly key: KeyFacts;
  readonly access: AccessFacts;
  readonly binding: BindingFacts;
  readonly probe: ProbeFacts;
  readonly read: ReadFacts;
  /**
   * A check row exists for this lane, but it was made through another
   * connection, against another dataset or an earlier version of the feed
   * (A18). `probe` and `read` are then empty: that check proves nothing about
   * the lane as it stands.
   */
  readonly evidenceSuperseded: boolean;
  /**
   * The check set aside was written before checks recorded the dataset and
   * feed version they proved (lane-authorisation.ts `laneEvidence`). Nothing
   * is known to have changed: only what that check proved is unknown.
   */
  readonly evidencePredatesKey?: boolean;
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
 * Access first: see the "Hop 2 before hop 1, deliberately" note on
 * `accessVerdict`. Keeping the two orders as separate named constants is
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

function hopVerdicts(
  facts: LaneFacts,
  brokenHop: LaneHop | null,
  undecidedHop: LaneHop | null,
): readonly LaneHopVerdict[] {
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
  /*
   * WHERE PROOF RAN OUT (A16). An Unknown lane has no broken hop, and it used
   * to be drawn exactly like a Live one: six green checks beside a chip that
   * says no read has been proven. The hops before the one we could not prove
   * passed — access, key and binding are facts, not checks — and that hop and
   * every one after it are "not checked", which is the truth.
   */
  if (brokenHop === null && undecidedHop !== null) {
    const undecidedAt = EVALUATION_ORDER.indexOf(undecidedHop);
    return LANE_HOPS.map((hop) => ({
      hop,
      state: EVALUATION_ORDER.indexOf(hop) < undecidedAt ? ("ok" as const) : ("unknown" as const),
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

/**
 * The verdict before the reason is attached — see `deriveLaneStatus` — with
 * the hop where proof ran out, for an Unknown lane (A16). Every `unknown`
 * verdict names one — or, when that hop was checked and failed, names it as
 * `failedHop` instead; nothing else does.
 */
type HopVerdict = Omit<LaneVerdict, "unchecked" | "hops"> & {
  readonly undecidedHop?: LaneHop;
  /**
   * A hop that was checked and FAILED on a verdict whose status has no chip
   * for that failure (a 404 read: Unknown). The status stays as derived; the
   * strip draws this hop broken and the ones after it unreached, because that
   * is what was observed — never "not checked" beside a sentence saying it
   * was checked (P0.2 review).
   */
  readonly failedHop?: LaneHop;
};

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

  /* ── Hop 2 before hop 1, deliberately: ACCESS (see accessVerdict) ──────── */
  const access = accessVerdict(facts);
  if (access !== null) return access;

  /* ── Hop 1: KEY ───────────────────────────────────────────────────────── */
  const key = keyVerdict(facts, now);
  if (key !== null) return key;

  /* ── Hop 3: BINDING ───────────────────────────────────────────────────── */
  const binding = bindingVerdict(facts);
  if (binding !== null) return binding;

  /*
   * ── Before any evidence: is there evidence for THIS lane? ──────────────
   *
   * A check proves something only about the connection, dataset and feed
   * version it ran against (A18). One made before any of them changed is set
   * aside by the reader (`evidenceSuperseded`), and the lane says why it has
   * none rather than living on another system's proof.
   *
   * And a feed the broker refuses on its definition — no dataset, or a
   * service it cannot resolve — answers 400 to every call. Whatever an old
   * check says, it is not Live.
   */
  if (facts.evidenceSuperseded) {
    return {
      status: "unknown",
      brokenHop: null,
      undecidedHop: "sapMetadata",
      because: facts.evidencePredatesKey
        ? "The last check was recorded before CoreEdge noted which SAP system, dataset and feed version a check proves, so it cannot speak for this lane now. Nothing about the lane is known to have changed."
        : "The SAP system, the dataset or the feed's definition changed after the last check, so that check proves nothing about this lane now.",
      checkedAt: null,
    };
  }
  if (!facts.sweep.feedHasDataset || !facts.sweep.feedServiceResolves) {
    return {
      status: "unknown",
      brokenHop: null,
      undecidedHop: "sapMetadata",
      because: !facts.sweep.feedHasDataset
        ? "This data feed names no dataset, so northbound refuses every call on it until one is chosen."
        : "CoreEdge cannot resolve the SAP service this feed names, so northbound refuses every call on it.",
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
      undecidedHop: "sapMetadata",
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
  /*
   * THE TWO STATUSES THE READER USED TO DROP (A17). The sweep writes them and
   * the reader narrowed them to "no read", so a 404 on a mistyped entity set
   * read every night as "no read has been proven". Both are observed failures.
   */
  if (read.outcome === "UNAUTHORIZED") {
    return {
      status: "signInRefused",
      brokenHop: "sapDataRead",
      because: "SAP rejected CoreEdge's sign-in when it read this dataset (HTTP 401).",
      checkedAt: read.at,
    };
  }
  if (read.outcome === "NOT_FOUND") {
    /*
     * An observed failure, with no chip of its own yet: the eighteen statuses
     * have none for a 404 on a dataset, and the nearest — SAP refused — is a
     * 403 owned by the client's SAP admin, while a 404 is usually a mistyped
     * or unreleased entity set the builder fixes. The SAP systems matrix makes
     * the same call (service-health.ts). So: Unknown, at the read hop, with
     * the real reason — never "no read has been proven". The strip draws the
     * read hop failed, not "not checked": it was checked, and SAP answered.
     */
    return {
      status: "unknown",
      brokenHop: null,
      failedHop: "sapDataRead",
      because:
        "SAP has no such dataset (HTTP 404). Check the entity set name, and that its service is released on this system.",
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
      undecidedHop: "sapDataRead",
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

/* ─────────────────────────────────────────────────────────────────────────────
 * The first three hops are the broker's own answers (P0.2)
 *
 * THE BOARD DREW LIVE WHERE THE BROKER REFUSED EVERY CALL, because these hops
 * kept their own copy of the broker's rules: no SANDBOX_ONLY, READ_ONLY or
 * DEPRECATED in the access hop, a count of connections by environment for the
 * binding, nothing of wave 1a's grant binding (A14, A15). The facts now carry
 * the broker's answers — `authorisesHere`, `keyRefusal`, `bindingFor` — and
 * these functions only choose the words. Whether a hop passes is never decided
 * here.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Access, worded. Passes exactly when `authorisesHere` authorised the lane.
 *
 * A lane with no approved access has nothing to collect a key FOR, so
 * reporting "No key" first would send the user to fetch something they cannot
 * yet be given. The handoff's own lane table agrees: No key means "access
 * approved, no key collected". Access is therefore the first question even
 * though Key is the first hop a CALL travels.
 */
function accessVerdict(facts: LaneFacts): HopVerdict | null {
  const { access, lane } = facts;
  if (access.refusal === null) return null;
  const refused = (status: LaneStatus, because: string): HopVerdict => ({
    status,
    brokenHop: "access",
    because,
    checkedAt: null,
  });
  const env = ENVIRONMENT_LABELS[lane.environment];

  switch (access.refusal) {
    case "INTERFACE_DEPRECATED":
      return refused("noAccess", "This data feed is deprecated, so northbound refuses every call on it.");
    case "INTERFACE_NOT_ACTIVE":
      return refused("noAccess", "This data feed writes and is not active yet. Northbound writes only through an active feed.");
    case "OPERATION_NOT_SUPPORTED":
      return refused(
        "noAccess",
        "This data feed changes records, and CoreEdge can only create them today, so northbound refuses every call on it.",
      );
    case "GRANT_NEEDS_REAPPROVAL":
      return refused(
        "noAccess",
        "Access was approved before approvals were bound to one data feed, and this deployment no longer honours it here. It needs approving again for this feed.",
      );
    case "GRANT_REVOKED":
      return refused("noAccess", "Access was withdrawn. Unlike an expiry, there is nothing to renew.");
    case "GRANT_EXPIRED":
      return refused("accessEnded", "Access reached its end date. The key survives; renewing keeps it.");
    case "NO_APPROVED_GRANT":
      break;
    default:
      // The interface is another app's, or the wrong mode for its own route:
      // neither is a lane, and neither is access. Said plainly, not guessed at.
      return refused("noAccess", "Northbound refuses every call on this data feed.");
  }

  // No grant authorises this lane. The current decision says which story it is.
  switch (access.decision) {
    case null:
      return refused("noAccess", "No access has been requested for this data feed in this environment.");
    case "REQUESTED":
      return refused("inReview", "Access was requested and a reviewer has not decided yet.");
    case "REJECTED":
      return refused("noAccess", "A reviewer declined this access request.");
    case "EXPIRED":
      return refused("accessEnded", "Access reached its end date. The key survives; renewing keeps it.");
    case "REVOKED":
      return refused("noAccess", "Access was withdrawn. Unlike an expiry, there is nothing to renew.");
    case "SANDBOX_ONLY":
      return refused("noAccess", `Access was approved for Sandbox only, so it authorises nothing in ${env}.`);
    case "READ_ONLY":
      if (isWriteOperation(lane.operation)) {
        return refused("noAccess", "Access was approved read-only, so it authorises nothing on a data feed that writes.");
      }
      break;
    default:
      break;
  }
  return refused("noAccess", `No approved access authorises this data feed in ${env}.`);
}

/** Key, worded. The key's own state is `keyRefusal`, the rule authentication applies. */
function keyVerdict(facts: LaneFacts, now: Date): HopVerdict | null {
  const { key, lane } = facts;
  const refused = (status: LaneStatus, because: string): HopVerdict => ({
    status,
    brokenHop: "key",
    because,
    checkedAt: null,
  });
  if (!key.exists) {
    return refused("noKey", "Access is approved but no key has been collected for this environment.");
  }
  switch (keyRefusal(key, now)) {
    case "REVOKED":
      return refused("keyNotValid", "The key for this environment was revoked.");
    case "INACTIVE":
      return refused("keyNotValid", "The key for this environment is not active.");
    case "EXPIRED":
      return refused("keyNotValid", "The key for this environment has expired.");
    // The current key is never "rotated out"; that is a replaced key presented.
    case "ROTATED_OUT":
    case null:
      break;
  }
  if (lane.route === "write" && !key.writeKeyIssued) {
    return refused(
      "noKey",
      "Access is approved but no write key has been issued for this environment, so northbound refuses every write.",
    );
  }
  if (lane.route === "write" && key.writeKeyUnopenable === true) {
    return refused(
      "keyNotValid",
      "A write key is issued for this environment, but CoreEdge cannot open it, so northbound refuses every write. Ours to fix, not SAP's: issue the write key again.",
    );
  }
  return null;
}

/** Binding, worded. Passes exactly when `bindingFor` (and, for a write, its gates) bound one connection. */
function bindingVerdict(facts: LaneFacts): HopVerdict | null {
  const { refusal } = facts.binding;
  if (refusal === null) return null;
  const refused = (status: LaneStatus, because: string): HopVerdict => ({
    status,
    brokenHop: "binding",
    because,
    checkedAt: null,
  });
  const env = ENVIRONMENT_LABELS[facts.lane.environment];
  switch (refusal) {
    case "CONNECTION_UNREADABLE":
      return refused("secretUnreadable", "CoreEdge cannot decrypt the SAP system's stored secret. Our fault, not SAP's.");
    case "NO_CONNECTION":
    case "NO_MATCH_FOR_ENVIRONMENT":
      return refused("noSapSystem", "No SAP system for this feed's product is connected for this environment.");
    case "NO_MATCH_FOR_CLIENT":
      return refused(
        "noSapSystem",
        "An SAP system is connected for this environment, but none addresses the SAP client this key is bound to.",
      );
    case "NO_DECLARED_CANDIDATE":
      return refused(
        "noSapSystem",
        "No SAP system declares this environment, and more than one has not declared any, so none can be assumed to be it.",
      );
    case "UNKNOWN_PRODUCT":
      return refused("noSapSystem", "This feed names an SAP product CoreEdge does not recognise, so no SAP system can serve it.");
    case "AMBIGUOUS":
      return refused("bindingRefused", "Two SAP systems claim this environment, and CoreEdge will not choose between them.");
    case "UNDECLARED_ENVIRONMENT_WRITE":
      return refused(
        "bindingRefused",
        "The SAP system has not declared which environment it is, so northbound will not write through it.",
      );
    case "WRITES_DISABLED":
      return refused("systemOff", "Writes are switched off on this SAP system's connection.");
    case "CUSTOM_SERVICE_UNVERIFIED":
      return refused(
        "bindingRefused",
        `This feed's own SAP service has not been verified in ${env} through this SAP system since it last changed, so northbound refuses its writes.`,
      );
  }
}

/**
 * The first reason a check is not standing behind this lane, in the sweep's own
 * order.
 *
 * ORDERED AS THE SWEEP SKIPS, deliberately (lane-check-sweep.ts
 * `laneCheckSkip`). A draft app whose environment also has no SAP system fails
 * the app filter first, so that is what a person has to change first;
 * reporting the missing system would send them to connect one for an app that
 * still would not be checked. `secretWouldNotOpen` comes first of all because
 * it is the one where the sweep reached the SAP system and failed there — an
 * answer, not an exclusion.
 */
function whyUnchecked(facts: LaneFacts): UncheckedReason {
  const { refusal } = facts.binding;
  if (refusal === "CONNECTION_UNREADABLE") return "secretWouldNotOpen";
  if (!facts.sweep.appIsActive) return "appNotLive";
  if (!facts.sweep.feedHasDataset) return "feedHasNoDataset";
  if (facts.access.refusal !== null) return "accessRefused";
  // A write gate on a bound connection: a setting refuses the lane, and the
  // sweep still reads through that connection. No check decides it, and none
  // having run since a change would be a false reason (P0.2 review).
  if (refusal === "WRITES_DISABLED" || refusal === "CUSTOM_SERVICE_UNVERIFIED") return "refusedBySetting";
  if (refusal !== null) return "noSapSystemHere";
  // After the system, as the sweep asks it: a connection is found first, then
  // the service it would be asked for.
  if (!facts.sweep.feedServiceResolves) return "feedServiceUnresolved";
  if (facts.evidenceSuperseded) {
    return facts.evidencePredatesKey === true ? "checkPredatesEvidenceKey" : "changedSinceCheck";
  }
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
  const { undecidedHop, failedHop, ...verdict } = deriveHopVerdict(facts);
  return {
    ...verdict,
    unchecked: verdict.checkedAt === null ? whyUnchecked(facts) : null,
    hops: hopVerdicts(facts, verdict.brokenHop ?? failedHop ?? null, undecidedHop ?? null),
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
    // Nothing requested is not a failure, so no hop is marked broken — and
    // nothing was established either, so none is marked passed (A16).
    hops: LANE_HOPS.map((hop) => ({ hop, state: "unknown" as const })),
  };
}
