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
  /** The hop the call stopped at, in the vocabulary's own terms. */
  readonly brokenHop: "key" | "access" | "binding" | "sapMetadata" | "sapDataRead" | null;
  readonly outcome: string;
  readonly rowCount: number | null;
  readonly durationMs: number | null;
  readonly dryRun: boolean;
}

/**
 * Which hop a stored status code means.
 *
 * Derived from the status and the recorded refusal rather than guessed: a 403
 * carrying a binding refusal stopped at the binding, and a 403 without one
 * reached SAP and was refused there. Those have different owners, which is the
 * entire reason the vocabulary keeps them apart.
 */
function hopFor(status: number, bindingRefusal: string | null, failureReason: string | null): CorrelatedCall["brokenHop"] {
  if (status === 401) return "key";
  if (status === 429) return "key";
  if (status === 403 && bindingRefusal !== null) return "binding";
  if (status === 403) {
    // A grant refusal is the Access hop; an SAP refusal is the read.
    return failureReason !== null && /grant|access|scope/i.test(failureReason)
      ? "access"
      : "sapDataRead";
  }
  if (status === 404) return "sapDataRead";
  if (status === 502 || status === 504) return "sapDataRead";
  if (status >= 200 && status < 300) return null;
  return "sapDataRead";
}

function describeOutcome(status: number, rowCount: number | null): string {
  if (status >= 200 && status < 300) {
    if (rowCount === 0) return "SAP answered successfully and had nothing to return.";
    if (rowCount === null) return "Succeeded.";
    return `Succeeded, ${rowCount} ${rowCount === 1 ? "row" : "rows"}.`;
  }
  if (status === 401) return "The key was not valid.";
  if (status === 429) return "Rate limited. Nothing was sent to SAP.";
  if (status === 403) return "Refused.";
  if (status === 404) return "Not found on this SAP system.";
  if (status === 504) return "SAP did not answer in time.";
  if (status === 502) return "SAP returned an error.";
  return `Failed with status ${status}.`;
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
      brokenHop: hopFor(row.status, row.bindingRefusal, row.failureReason),
      outcome: describeOutcome(row.status, row.rowCount),
      rowCount: row.rowCount,
      durationMs: row.durationMs,
      dryRun: row.dryRun,
    },
  };
}
