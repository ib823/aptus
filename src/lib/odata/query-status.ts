/**
 * The query surface's read outcomes, and what the broker answers for each
 * (P1.4, 3.8.2). Pure, like read-status.ts.
 *
 * A SEPARATE TYPE, NOT A WIDER ONE. NorthboundReadStatus is what the legacy
 * read can produce, and the Test Console's fixture scenarios switch over it
 * exhaustively (studio/fixtures.ts): widening it would invent fixture
 * scenarios the legacy read never produces, and the mock would have to serve
 * them. So the query surface's three extra outcomes live here, and
 * read-status.ts is unchanged.
 *
 *   NO_RECORD     a key lookup SAP answered 404: there is no such record.
 *                 404 RECORD_NOT_FOUND, not NOT_FOUND, which says the dataset
 *                 itself is missing (D13).
 *   SAP_REJECTED  SAP refused the query CoreEdge built (400, 405, 406, 412,
 *                 422, 501). 422 VALIDATION_ERROR: the query must change, and
 *                 retrying it unchanged will not help (D12). SAP's own text is
 *                 never forwarded.
 *   TOO_LARGE     SAP's page was larger than CoreEdge reads (16 MiB). 422 on
 *                 the query surface, where the caller can ask for less; the
 *                 legacy read keeps its 502.
 */

import type { SapQueryKind } from "@/lib/odata/operation-compiler";
import type { QueryRule } from "@/lib/odata/rules";
import { httpStatusFor, northboundErrorCodeFor, type NorthboundReadStatus } from "@/lib/northbound/read-status";

export type QueryReadStatus = NorthboundReadStatus | "NO_RECORD" | "SAP_REJECTED" | "TOO_LARGE";

/** Every query outcome, for code that must cover them all. */
export const QUERY_READ_STATUSES: readonly QueryReadStatus[] = [
  "OK",
  "EMPTY",
  "NEEDS_SETUP",
  "NOT_FOUND",
  "TIMEOUT",
  "ERROR",
  "NO_RECORD",
  "SAP_REJECTED",
  "TOO_LARGE",
];

/** The HTTP status the broker returns: the legacy five exactly as read-status.ts. */
export function httpStatusForQuery(status: QueryReadStatus): number {
  switch (status) {
    case "NO_RECORD":
      return 404;
    case "SAP_REJECTED":
    case "TOO_LARGE":
      return 422;
    default:
      return httpStatusFor(status);
  }
}

export type QueryErrorCode = ReturnType<typeof northboundErrorCodeFor> | "RECORD_NOT_FOUND" | "VALIDATION_ERROR";

/** The error code sent with each failed outcome. */
export function queryErrorCodeFor(status: Exclude<QueryReadStatus, "OK" | "EMPTY">): QueryErrorCode {
  switch (status) {
    case "NO_RECORD":
      return "RECORD_NOT_FOUND";
    case "SAP_REJECTED":
    case "TOO_LARGE":
      return "VALIDATION_ERROR";
    default:
      return northboundErrorCodeFor(status);
  }
}

/** The `error.query.rule` an outcome carries, when it has one. */
export function queryRuleForStatus(status: QueryReadStatus): QueryRule | null {
  switch (status) {
    case "SAP_REJECTED":
      return "SAP_REJECTED";
    case "TOO_LARGE":
      return "UPSTREAM_PAGE_TOO_LARGE";
    default:
      return null;
  }
}

/** The statuses with which SAP refuses a query as a query: the caller's to change. */
export const SAP_REJECTED_HTTP: readonly number[] = [400, 405, 406, 412, 422, 501];

/**
 * The outcome of a non-2xx answer, by the kind of query that was sent.
 * 401 and 403 are NEEDS_SETUP as on the legacy read; a 404 is a missing
 * record only for a key lookup by path (KEY) — a list, or a key read through
 * the filter fallback, that SAP answers 404 names a dataset SAP does not have.
 * Anything else — a 3xx (never followed), a 500, a 503 — is ERROR.
 */
export function queryStatusForHttp(httpStatus: number, kind: SapQueryKind): Exclude<QueryReadStatus, "OK" | "EMPTY" | "TIMEOUT" | "TOO_LARGE"> {
  if (httpStatus === 401 || httpStatus === 403) return "NEEDS_SETUP";
  if (httpStatus === 404) return kind === "KEY" ? "NO_RECORD" : "NOT_FOUND";
  if (SAP_REJECTED_HTTP.includes(httpStatus)) return "SAP_REJECTED";
  return "ERROR";
}

/** What the caller is told for the query surface's own outcomes. Never SAP's text, a URL or a host. */
export function queryOutcomeDetail(status: "NO_RECORD" | "SAP_REJECTED" | "TOO_LARGE", httpStatus: number | null): string {
  switch (status) {
    case "NO_RECORD":
      return "SAP has no record with this key.";
    case "SAP_REJECTED":
      return `The SAP service refused this query (HTTP ${httpStatus ?? "error"}). Change the query; retrying it unchanged will not help.`;
    case "TOO_LARGE":
      return "SAP's answer to this page is larger than CoreEdge reads (16 MB); ask for a smaller pageSize or fewer fields.";
  }
}
