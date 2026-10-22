/**
 * A lane's first three hops, answered by the broker's own functions (P0.2).
 *
 * The board (queries.ts `listLanes`) and the nightly sweep
 * (lane-check-sweep.ts) both call `laneAuthorisation` on the rows they read,
 * so the board cannot call a lane live that the broker refuses, and the sweep
 * reads SAP only for lanes the broker would serve, through the connection it
 * would bind:
 *
 *   access   authorisesHere — the interface's mode and status, every grant
 *            fetched for it (bound to it on its product or, under legacy, an
 *            unbound grant within its cut-off), SANDBOX_ONLY and READ_ONLY,
 *            revocation and expiry; in the CREDENTIAL'S environment, as the
 *            broker compares it.
 *   key      the credential row, judged by keyRefusal in the derivation; and
 *            for a lane that writes, whether a write key is sealed on it.
 *   binding  bindingFor on the organisation's connections for the feed's
 *            product, with the credential's SAP client; then the bound
 *            connection's transport (transport.ts `transportRefusal`: a TWIN
 *            connection with no twin engine is refused, as the broker's
 *            binding step refuses it); for a write, the write route's gates
 *            on the bound connection.
 *
 * `laneEvidence` then decides which check row may speak for the lane: only
 * one made through the bound connection, against the feed's entity set and
 * its current version (A18). The bound connection is `bound`, the one the
 * sweep reads through, not `connection`: a write lane refused at its write
 * gates still has a check made through it, and that check has not "changed".
 *
 * The key hop for a write lane also asks whether the sealed write key OPENS
 * (`writeKeyUnopenable`): the write route opens it on every call and refuses
 * the write when it will not, so a board that only asked whether one exists
 * drew Live a lane whose every write is refused.
 *
 * PURE. The I/O is the caller's.
 */

import {
  authorisesHere,
  bindingFor,
  routeOf,
  writeSwitchRefusal,
  type AuthorisableInterface,
  type AuthorisingGrant,
  type BindingEstate,
  type BrokerRoute,
} from "@/lib/northbound/authorisation";
import { reachedDirectly, transportRefusal } from "@/lib/governed/transport";
import type { BindableConnection } from "@/lib/sap-public/connection-selection";
import { grantFetchedFor, type GrantBindingMode } from "@/lib/studio/grant-binding";
import { effectiveDecision } from "@/lib/studio/grants";

import {
  LEDGER_READ_STATUSES,
  type AccessFacts,
  type BindingFacts,
  type KeyFacts,
  type LaneEnvironment,
  type ProbeFacts,
  type ReadFacts,
} from "./lanes";

/** A grant of the solution, with what it is matched on. */
export interface LaneGrantRow extends AuthorisingGrant {
  readonly externalId: string;
  readonly operation: string;
  readonly environment: string;
}

/** The lane's credential: the solution's SolutionClient for this environment. */
export interface LaneCredentialRow {
  readonly environment: string;
  readonly sapClient: string | null;
  readonly isActive: boolean;
  readonly revokedAt: Date | null;
  readonly expiresAt: Date | null;
  /** A write key is sealed on the row (`secretsCiphertext` is set). */
  readonly writeKeyIssued: boolean;
  /**
   * The sealed write key will not open (write-credential.ts `writeKeyOpens`):
   * the write route refuses every write from this credential. Only the board
   * opens it, and only for an app with a feed that writes; absent means it
   * was not opened.
   */
  readonly writeKeyUnopenable?: boolean;
}

/** A connection as the board and the sweep hold it. */
export interface LaneConnection extends BindableConnection {
  readonly id: string;
  readonly label: string;
  readonly client: string | null;
  readonly baseUrl: string;
  readonly writeEnabled: boolean;
  /**
   * How the broker reaches it (SapConnection.transport): DIRECT, or TWIN for
   * the Tenant Twin. Absent reads as DIRECT, as transport.ts reads it.
   */
  readonly transport?: string | null;
}

export interface LaneAuthorisationInput<C extends LaneConnection> {
  readonly iface: AuthorisableInterface;
  readonly solutionId: string;
  readonly environment: LaneEnvironment;
  /** The solution's grants, newest first; the lane's are picked out here. */
  readonly grants: readonly LaneGrantRow[];
  readonly credential: LaneCredentialRow | null;
  /** The organisation's connections for the feed's product (binding.ts loadBindingEstate). */
  readonly estate: BindingEstate<C>;
  readonly now: Date;
  readonly bindingMode?: GrantBindingMode;
}

export interface LaneAuthorisation<C extends LaneConnection> {
  readonly route: BrokerRoute;
  /**
   * The environment the broker would compare: the credential's own, as
   * written on its row, or the lane's when there is no credential yet.
   */
  readonly credentialEnvironment: string;
  /** The grants the broker would fetch for this lane. */
  readonly grants: readonly LaneGrantRow[];
  readonly access: AccessFacts;
  readonly key: KeyFacts;
  readonly binding: BindingFacts;
  /** The connection a call would go through, or null when the binding refuses. */
  readonly connection: C | null;
  /**
   * The connection `bindingFor` chose, before a write lane's gates on it (its
   * write switch, its custom-service verification). The sweep reads through
   * this one: a read through it is evidence for the lane the day those gates
   * open, and the board refuses the lane at binding until then.
   *
   * Null for a connection that is not reached DIRECT (transport.ts
   * `reachedDirectly`): the sweep reads SAP with the platform's own fetch and
   * the connection's stored credentials, and a TWIN connection is kept off
   * the customer's SAP, so nothing reads through it and no check speaks for
   * it (wave 2 integration review round 3).
   */
  readonly bound: C | null;
  /** The chosen connection is not reached DIRECT, so `bound` is null for it. */
  readonly notDirect: boolean;
}

export function laneAuthorisation<C extends LaneConnection>(
  input: LaneAuthorisationInput<C>,
): LaneAuthorisation<C> {
  const { iface, solutionId, environment, credential, estate, now } = input;
  const route = routeOf(iface);
  const credentialEnvironment = credential?.environment ?? environment;

  // What the broker fetches: this environment exactly (it compares the
  // credential's string), this service and operation, bound here or unbound.
  const grants = input.grants.filter(
    (g) => g.environment === credentialEnvironment && grantFetchedFor(g, iface),
  );
  const decision = authorisesHere({
    iface,
    solutionId,
    environment: credentialEnvironment,
    route,
    grants,
    now,
    ...(input.bindingMode === undefined ? {} : { bindingMode: input.bindingMode }),
  });
  // The words come from the newest grant: a renewal is a new row, and the
  // newest is the one a person acted on last.
  const current = grants[0];
  const access: AccessFacts = {
    decision: current === undefined ? null : (effectiveDecision(current, now) as AccessFacts["decision"]),
    expiresAt: current?.expiresAt ?? null,
    revokedAt: current?.revokedAt ?? null,
    refusal: decision.ok ? null : decision.reason,
  };

  const key: KeyFacts = {
    exists: credential !== null,
    isActive: credential?.isActive ?? false,
    revokedAt: credential?.revokedAt ?? null,
    expiresAt: credential?.expiresAt ?? null,
    writeKeyIssued: credential?.writeKeyIssued ?? false,
    writeKeyUnopenable: credential?.writeKeyUnopenable ?? false,
  };

  const bound = bindingFor(estate, credentialEnvironment, route, credential?.sapClient ?? null);
  const binding: BindingFacts = {
    refusal: !bound.ok
      ? bound.reason
      : (transportRefusal(bound.connection) ??
        (route === "write" ? writeSwitchRefusal(iface, credentialEnvironment, bound.connection) : null)),
  };
  const notDirect = bound.ok && !reachedDirectly(bound.connection);

  return {
    route,
    credentialEnvironment,
    grants,
    access,
    key,
    binding,
    connection: bound.ok && binding.refusal === null ? bound.connection : null,
    bound: bound.ok && !notDirect ? bound.connection : null,
    notDirect,
  };
}

/* ── the evidence ──────────────────────────────────────────────────────── */

/** A LaneCheck row, as the board reads it. */
export interface LaneCheckRow {
  readonly connectionId: string | null;
  readonly entitySet: string | null;
  readonly interfaceVersion: number | null;
  readonly probeStatus: string | null;
  readonly probeAt: Date | null;
  readonly readStatus: string | null;
  readonly readAt: Date | null;
  readonly readRowCount: number | null;
}

const PROBE_STATUSES = ["OK", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "TIMEOUT", "ERROR", "NO_PROBE_PATH"] as const;

/**
 * The ledger stores these as `String?`, and the derivation takes a closed union.
 *
 * An unrecognised value becomes null — "we do not know" — rather than being
 * cast into the union. A cast would let a status nobody has defined arrive at
 * `deriveLaneStatus` and fall through to whichever branch happens to catch it,
 * which is how a lane ends up claiming something no check established.
 */
export function narrowProbeStatus(value: string | null): ProbeFacts["status"] {
  return (PROBE_STATUSES as readonly string[]).includes(value ?? "") ? (value as ProbeFacts["status"]) : null;
}

/** The reader's vocabulary IS the writer's (`LEDGER_READ_STATUSES`, A17). */
export function narrowReadOutcome(value: string | null): ReadFacts["outcome"] {
  return (LEDGER_READ_STATUSES as readonly string[]).includes(value ?? "") ? (value as ReadFacts["outcome"]) : null;
}

export interface LaneEvidence {
  readonly probe: ProbeFacts;
  readonly read: ReadFacts;
  /** A row exists and was set aside: see LaneFacts.evidenceSuperseded. */
  readonly superseded: boolean;
  /**
   * The row set aside was written before checks recorded what they proved
   * (no entity set or feed version on it): see LaneFacts.evidencePredatesKey.
   */
  readonly predatesKey: boolean;
}

const NO_EVIDENCE = {
  probe: { status: null, at: null },
  read: { outcome: null, at: null, rows: null },
} as const;

/**
 * Which check may speak for the lane (A18): one made through the connection
 * `bindingFor` chose (`LaneAuthorisation.bound`, the one the sweep reads
 * through), against the feed's entity set, at the feed's current version
 * (bumped by every change to its operation, dataset or service). Anything
 * else is set aside — a replaced connection or an edited feed no longer
 * inherits a Live status.
 *
 * A row with no entity set or feed version was written before checks recorded
 * them: it is set aside too, as `predatesKey`, because nothing is known to
 * have changed — we only do not know what it proved, and saying "it changed"
 * would send an operator looking for a change nobody made.
 */
export function laneEvidence(
  check: LaneCheckRow | undefined,
  connection: { readonly id: string } | null,
  feed: { readonly entitySet: string | null; readonly version: number },
): LaneEvidence {
  if (check === undefined) return { ...NO_EVIDENCE, superseded: false, predatesKey: false };
  if (check.entitySet === null || check.interfaceVersion === null) {
    return { ...NO_EVIDENCE, superseded: true, predatesKey: true };
  }
  const matches =
    connection !== null &&
    check.connectionId === connection.id &&
    check.entitySet === feed.entitySet &&
    check.interfaceVersion === feed.version;
  if (!matches) return { ...NO_EVIDENCE, superseded: true, predatesKey: false };
  return {
    probe: { status: narrowProbeStatus(check.probeStatus), at: check.probeAt },
    read: { outcome: narrowReadOutcome(check.readStatus), at: check.readAt, rows: check.readRowCount },
    superseded: false,
    predatesKey: false,
  };
}
