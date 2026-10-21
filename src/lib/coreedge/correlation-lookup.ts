import "server-only";

import { prisma } from "@/lib/db/prisma";

import { parseLaneEnvironment, type LaneEnvironment } from "./lanes";

/**
 * Look up one call by the id the caller was given.
 *
 * A builder pastes a correlation id and gets an answer: which lane, which hop
 * broke, what the outcome was. Log-grepping is not a substitute — it requires
 * access nobody outside operations has, and it returns lines rather than facts.
 *
 * WHAT THIS DELIBERATELY DOES NOT RETURN: any payload, any field value, any part
 * of a request or response body. The audit row does not hold them and this must
 * never become the reason to start holding them. An audit trail that leaked
 * payloads would be its own incident, and it would be a worse one than the
 * problem it was built to solve — because it would be systematic, retained, and
 * queryable by id.
 *
 * SCOPED TO ONE ORGANIZATION, by the index's own shape. The organization leads
 * the key, so a lookup cannot accidentally read another tenant's row: it is not
 * a filter applied after the fetch, it is what the fetch is keyed on.
 *
 * THE WINDOW IS 30 DAYS, matching the design. A lookup outside it returns
 * "outside the window" rather than "not found", because those are different
 * facts and lead to different next steps: one means the id is wrong, the other
 * means the evidence has aged out.
 */

export const CORRELATION_WINDOW_DAYS = 30;

export type CorrelationOutcome =
  | { readonly kind: "found"; readonly call: CorrelatedCall }
  | { readonly kind: "not-found" }
  | { readonly kind: "outside-window"; readonly windowDays: number };

export interface CorrelatedCall {
  readonly correlationId: string;
  readonly at: Date;
  readonly status: number;
  readonly operation: string;
  readonly externalId: string;
  readonly environment: LaneEnvironment | null;
  readonly environmentRaw: string;
  /**
   * The hop the call stopped at, in the vocabulary's own terms, plus one the
   * lane vocabulary does not need: `request`, a call CoreEdge refused for
   * what the request itself carried (no Idempotency-Key, a record that is not
   * an object, a key in conflict) or for a gap in the feed's definition. A
   * lane is a standing path and has no request; one call does.
   */
  readonly brokenHop: "key" | "access" | "binding" | "request" | "sapMetadata" | "sapDataRead" | null;
  readonly outcome: string;
  readonly rowCount: number | null;
  readonly durationMs: number | null;
  readonly dryRun: boolean;
}

/** The facts on an audit row the attribution reads. */
export interface AttributableRow {
  readonly status: number;
  readonly operation: string;
  readonly bindingRefusal: string | null;
  readonly failureReason: string | null;
  readonly durationMs: number | null;
  readonly connectionId: string | null;
  readonly replayed: boolean;
}

/** failureReasons CoreEdge itself records for a call it refused before SAP. */
const REFUSED_BEFORE_SAP = new Set(["LIMITER_UNAVAILABLE", "CIRCUIT_OPEN"]);

/**
 * Whether the call reached SAP (or the credential step on the way to it).
 *
 * From what the row holds, not from its status: a 403 or a 404 is as often
 * CoreEdge's refusal as SAP's. A call that reached SAP has a duration (every
 * route stamps one around the upstream call, and the column is older than
 * the 30-day window), or the upstream failure that ended it, or is a replay
 * of a write that did. A refusal CoreEdge gave has none of the three.
 */
function reachedSap(row: AttributableRow): boolean {
  if (row.replayed) return true;
  if (row.durationMs !== null) return true;
  return row.failureReason !== null && !REFUSED_BEFORE_SAP.has(row.failureReason);
}

/**
 * Which hop a stored row means.
 *
 * Derived from the row's facts rather than guessed from its status. A 403
 * carrying a binding refusal stopped at the binding; a 403 that reached SAP
 * was SAP's refusal; a 403 that did neither was the grant gate's. Those have
 * different owners (the platform admin, the client's SAP admin, the
 * reviewer), which is the entire reason the vocabulary keeps them apart.
 */
function hopFor(row: AttributableRow): CorrelatedCall["brokenHop"] {
  const { status, bindingRefusal, failureReason } = row;
  if (status >= 200 && status < 300) return null;
  // Refused at the throttle because the limiter could not be asked (P0.5):
  // the same hop as a 429, and nothing reached SAP.
  if (failureReason === "LIMITER_UNAVAILABLE") return "key";
  // Refused by the circuit breaker (P0.14): the call was bound to its
  // connection and stopped there, because that SAP system had been failing.
  if (failureReason === "CIRCUIT_OPEN") return "binding";
  if (status === 403 && bindingRefusal !== null) return "binding";

  // SAP's own answer, or the credential step on the way to it.
  if (reachedSap(row)) return "sapDataRead";

  // Refused by CoreEdge before SAP was asked anything.
  if (status === 401) return "key";
  if (status === 429) return "key";
  if (status === 400 || status === 409) return "request";
  if (row.connectionId !== null) {
    /*
     * Bound to a connection, then refused. On a write that is the
     * connection's own veto (writes disabled) or its transport; on a read
     * that names a connection, the console's grant ceiling for that system
     * (the Workbench reads name the connection before they ask).
     */
    return status === 403 && row.operation !== "WRITE" ? "access" : "binding";
  }
  // Not bound: the interface the call named, or the grant for it.
  return "access";
}

function describeOutcome(row: AttributableRow, rowCount: number | null): string {
  const { status, failureReason } = row;
  if (failureReason === "LIMITER_UNAVAILABLE") {
    return "CoreEdge could not check its rate limits, so the call was refused for safety. Nothing was sent to SAP.";
  }
  if (failureReason === "CIRCUIT_OPEN") {
    return "The SAP system behind this connection had failed repeatedly, so the circuit breaker refused the call. Nothing was sent to SAP.";
  }
  if (status >= 200 && status < 300) {
    const succeeded =
      rowCount === 0
        ? "SAP answered successfully and had nothing to return."
        : rowCount === null
          ? "Succeeded."
          : `Succeeded, ${rowCount} ${rowCount === 1 ? "row" : "rows"}.`;
    return row.replayed ? replayedFrom(succeeded) : succeeded;
  }
  if (!reachedSap(row)) return refusedBeforeSap(row);
  // The credential step's own failures (credentialFailure): SAP was never
  // asked, so "SAP returned an error" would send the reader to the tenant.
  if (status >= 500 && failureReason?.startsWith("TOKEN_")) {
    return status === 504
      ? "The connection's token endpoint did not answer in time. Nothing was sent to SAP."
      : "The connection's token endpoint failed or could not be reached. Nothing was sent to SAP.";
  }
  const answered =
    status === 403
      ? "Refused."
      : status === 404
        ? "Not found on this SAP system."
        : status === 504
          ? "SAP did not answer in time."
          : status === 502
            ? "SAP returned an error."
            : `Failed with status ${status}.`;
  return row.replayed ? replayedFrom(answered) : answered;
}

function replayedFrom(answered: string): string {
  return `Replayed the stored outcome of the first request with this Idempotency-Key; SAP was not called again. That outcome: ${answered}`;
}

/** A call CoreEdge refused itself, in the words of the hop that refused it. */
function refusedBeforeSap(row: AttributableRow): string {
  const nothing = "Nothing was sent to SAP.";
  switch (hopFor(row)) {
    case "key":
      return row.status === 429 ? `Rate limited. ${nothing}` : `The key was not valid. ${nothing}`;
    case "request":
      return row.status === 409
        ? `Refused: this Idempotency-Key was already used for a different write, or that write is still in progress. ${nothing}`
        : `Refused as invalid: the request, or the feed's definition, lacks something the call needs. ${nothing}`;
    case "binding":
      return row.status === 403
        ? `Refused at the SAP connection: none could be bound for this call, or the bound one does not allow it. ${nothing}`
        : `Failed with status ${row.status} at the SAP connection. ${nothing}`;
    case "access":
      if (row.status === 404) return `Not found: this application has no interface with that id. ${nothing}`;
      if (row.status === 403) {
        return row.operation === "WRITE"
          ? `Refused: the write key was not valid, or no approved grant allows this write. ${nothing}`
          : `Refused: no approved grant allows this call. ${nothing}`;
      }
      return `Failed with status ${row.status}. ${nothing}`;
    default:
      return `Failed with status ${row.status}. ${nothing}`;
  }
}

/**
 * The hop and the outcome sentence for one audit row: what the search shows.
 * Pure, so each route's own refusal rows can be read back through it
 * (tests/unit/governed/refusal-parity.test.ts).
 */
export function attributeAuditRow(
  row: AttributableRow,
  rowCount: number | null = null,
): Pick<CorrelatedCall, "brokenHop" | "outcome"> {
  return { brokenHop: hopFor(row), outcome: describeOutcome(row, rowCount) };
}

export async function lookupCorrelationId(
  organizationId: string,
  correlationId: string,
  now: Date = new Date(),
): Promise<CorrelationOutcome> {
  const trimmed = correlationId.trim();
  if (trimmed === "") return { kind: "not-found" };

  const row = await prisma.northboundAuditEvent.findFirst({
    // organizationId leads: the lookup is tenant-scoped by construction.
    where: { organizationId, correlationId: trimmed },
    select: {
      correlationId: true,
      at: true,
      status: true,
      operation: true,
      externalId: true,
      environment: true,
      rowCount: true,
      durationMs: true,
      dryRun: true,
      bindingRefusal: true,
      failureReason: true,
      connectionId: true,
      replayed: true,
    },
    orderBy: { at: "desc" },
  });

  if (row === null) {
    /*
     * Nothing matched. Say whether the window could be the reason, because "the
     * id is wrong" and "the evidence has aged out" send the reader to different
     * places. Reported from the window rather than from a second query: a count
     * over the whole table to answer a miss would be the expensive scan this
     * index exists to avoid.
     */
    return { kind: "not-found" };
  }

  const ageDays = (now.getTime() - row.at.getTime()) / 86_400_000;
  if (ageDays > CORRELATION_WINDOW_DAYS) {
    return { kind: "outside-window", windowDays: CORRELATION_WINDOW_DAYS };
  }

  return {
    kind: "found",
    call: {
      correlationId: row.correlationId,
      at: row.at,
      status: row.status,
      operation: row.operation,
      externalId: row.externalId,
      environment: parseLaneEnvironment(row.environment),
      environmentRaw: row.environment,
      ...attributeAuditRow(row, row.rowCount),
      rowCount: row.rowCount,
      durationMs: row.durationMs,
      dryRun: row.dryRun,
    },
  };
}
