/**
 * Every error code the northbound API can send, and every internal refusal
 * reason behind one — the table the generated OpenAPI documents (P1.3).
 *
 * EXHAUSTIVE BY CONSTRUCTION. Each table is typed against the union it
 * documents (`satisfies Record<…>`), so a code or a reason added to the broker
 * without a line here fails the type-check, not a reader in production.
 *
 * TWO LEVELS, ON PURPOSE. A caller branches on `error.code` and the HTTP
 * status. Many internal reasons share one code — every key-state refusal
 * (expired, revoked, rotated out after the overlap, P0.11) is the same 401
 * UNAUTHENTICATED, so a probe learns nothing about a key it does not hold;
 * the credential-step failures (P0.5's TOKEN_*) are audit-row reasons behind
 * UPSTREAM_ERROR, UPSTREAM_TIMEOUT or FORBIDDEN. The reasons are documented
 * so a developer quoting a correlation id knows what an operator will find,
 * never so a client can branch on them: they are not in any response body.
 */

import type { AccessRefusal } from "@/lib/northbound/access";
import type { ClientAuthFailure } from "@/lib/northbound/auth";
import type { NorthboundErrorCode } from "@/lib/northbound/respond";
import { QUERY_RULE_MEANING, type QueryRefusalReason, type QueryRule } from "@/lib/odata/rules";

export interface ErrorCodeDoc {
  /** HTTP statuses this code is sent with. */
  statuses: readonly number[];
  meaning: string;
  /** What the caller should do. */
  action: string;
}

export const NORTHBOUND_ERROR_CODES = {
  UNAUTHENTICATED: {
    statuses: [401],
    meaning:
      "The client token is missing, unknown, inactive, revoked or expired, was replaced by a rotation whose overlap has closed, or belongs to a retired solution. One answer for all of them, deliberately.",
    action: "Use a current key from Developer Studio. Do not retry with the same key.",
  },
  FORBIDDEN: {
    statuses: [403],
    meaning:
      "Not set up: no approved, unexpired, unrevoked grant for this interface in this environment (or one approved before grants were bound to an interface, which needs re-approval), a deprecated interface, a missing or invalid write key, writes disabled on the connection, or the SAP system refused the connection's credential.",
    action: "Fix access in Studio. Do not retry.",
  },
  CONNECTION_NOT_CONFIGURED: {
    statuses: [403, 503],
    meaning:
      "403: the customer's SAP connection cannot be bound for this credential's environment yet. 503: the bound connection is served by the Tenant Twin and no twin answers on this deployment; nothing reached SAP (P0.14).",
    action: "Ask the customer to finish connecting their SAP system. Do not retry.",
  },
  NOT_FOUND: {
    statuses: [404],
    meaning:
      "No interface with this id belongs to the solution this token was issued for, or the SAP system answered that the dataset does not exist.",
    action: "Fix the interface id or its configuration. Do not retry.",
  },
  VALIDATION_ERROR: {
    statuses: [400, 413, 422],
    meaning:
      "400: the request or the interface's definition cannot be used as it stands (no dataset, an invalid service path, a missing Idempotency-Key, a body that is not { record }, an unverified own service), or a query that cannot be served as sent: a parameter outside the query grammar, a value not of its field's type, a cursor that cannot be used or was sent with other parameters than its first page, an interface that serves no queries (error.query.rule says which). 422: SAP rejected the record itself; also, SAP rejected the query, one record is larger than the page limit, or SAP's page was larger than CoreEdge reads. 413: the answer is larger than CoreEdge can return.",
    action: "Fix the request or the interface. Do not retry unchanged.",
  },
  POLICY_FIELD_NOT_GRANTED: {
    statuses: [400],
    meaning:
      "The query asks for what the interface's query policy does not allow: a field it may not read, filter or sort on, an operator, key lookup, a count, a page size above its maximum, or a query without a filter the policy or SAP requires. error.query names the rule, the field and what is allowed. Nothing was sent to SAP (P1.4).",
    action: "Change the query within the interface's query policy, or ask its builder to allow it. Do not retry unchanged.",
  },
  CURSOR_STALE: {
    statuses: [409],
    meaning:
      "The paging cursor has expired (15 minutes per cursor, 2 hours per paging run), or the interface, its query policy, its grant or its connection changed since the first page (P1.4).",
    action: "Start the read again from the first page.",
  },
  RECORD_NOT_FOUND: {
    statuses: [404],
    meaning: "A key lookup found no record: SAP has none with this key (P1.4).",
    action: "SAP has no record with this key. Not an error to retry.",
  },
  CONFLICT: {
    statuses: [409],
    meaning:
      "The Idempotency-Key was used before with a different payload or destination — or, with Retry-After, the first request under this key is still running.",
    action: "With Retry-After: retry with the SAME key after it. Without: use a new key for a different write.",
  },
  RATE_LIMITED: {
    statuses: [429],
    meaning: "This credential used its own per-minute budget.",
    action: "Back off for Retry-After seconds.",
  },
  RATE_LIMITED_ADDRESS: {
    statuses: [429],
    meaning:
      "The caller's address is over a limit (the edge's per-address backstop, or too many unrecognised keys from it). Another key on a shared egress may have spent it.",
    action: "Back off for Retry-After seconds; backing off one key may not help.",
  },
  RATE_LIMIT_EXCEEDED: {
    statuses: [429],
    meaning:
      "The caller's address is over the edge's ordinary per-address limit (300 GET or 120 POST a minute), which a call meets when no per-credential limit applies: GET /versions, a call with no Authorization header, or every call while per-credential limits are switched off.",
    action: "Back off for Retry-After seconds; send the client token on every call.",
  },
  LIMITER_UNAVAILABLE: {
    statuses: [503],
    meaning: "The rate limiter could not be asked, so the call was refused for safety. Nothing reached SAP.",
    action: "Retry after Retry-After seconds.",
  },
  CIRCUIT_OPEN: {
    statuses: [503],
    meaning:
      "The circuit breaker for the SAP system behind the bound connection is open after repeated failures to answer, so the call was refused before anything was sent to SAP (P0.14). Sent only where the breaker enforces; a refused write releases its Idempotency-Key.",
    action: "Retry after Retry-After seconds; for a write, retry with the same Idempotency-Key.",
  },
  UPSTREAM_TIMEOUT: {
    statuses: [504],
    meaning: "The SAP system, or the connection's token endpoint, did not answer in time.",
    action: "Retry; for a write, retry with the same Idempotency-Key.",
  },
  UPSTREAM_ERROR: {
    statuses: [502],
    meaning:
      "The SAP system, or the connection's token endpoint, failed or answered in a way the broker could not use. With error.query.rule UPSTREAM_IGNORED_PAGING or KEY_NOT_UNIQUE, the service did not honour the paging CoreEdge asked for, or returned two records for one key: retrying does not help.",
    action: "Retry or escalate with the correlation id; with error.query.rule set, escalate without retrying.",
  },
  UNSUPPORTED_VERSION: {
    statuses: [400],
    meaning:
      "The request's CoreEdge-Version header names a version this deployment does not serve: unknown, or retired at its Sunset date. Refused before the route does anything else (no credential check, no idempotency reservation, nothing sent to SAP); `error.supportedVersions` lists what may be sent (P1.10).",
    action: "Send one of error.supportedVersions, or omit the header to be served the default. Do not retry unchanged.",
  },
  INTERNAL: {
    statuses: [500],
    meaning: "CoreEdge itself failed.",
    action: "Escalate with the correlation id.",
  },
} as const satisfies Record<NorthboundErrorCode, ErrorCodeDoc>;

export const ALL_ERROR_CODES = Object.keys(NORTHBOUND_ERROR_CODES) as NorthboundErrorCode[];

export interface RefusalReasonDoc {
  reason: string;
  code: NorthboundErrorCode;
  status: number;
  /** Which roadmap item introduced it, where one did. */
  origin?: string;
}

/** Why a token was refused (northbound/auth.ts). Every one is the same 401. */
const AUTH_REASONS = {
  NO_TOKEN: {},
  UNKNOWN_TOKEN: {},
  INACTIVE: {},
  REVOKED: {},
  EXPIRED: { origin: "P0.11" },
  ROTATED_OUT: { origin: "P0.11" },
  SOLUTION_RETIRED: {},
  SOLUTION_MISSING: {},
} as const satisfies Record<ClientAuthFailure, { origin?: string }>;

/** Why an authenticated caller was refused an interface (northbound/access.ts). */
const ACCESS_REASONS = {
  INTERFACE_NOT_FOUND: { code: "NOT_FOUND", status: 404 },
  NOT_THIS_SOLUTION: { code: "NOT_FOUND", status: 404 },
  NO_APPROVED_GRANT: { code: "FORBIDDEN", status: 403 },
  GRANT_EXPIRED: { code: "FORBIDDEN", status: 403 },
  GRANT_REVOKED: { code: "FORBIDDEN", status: 403 },
  GRANT_NEEDS_REAPPROVAL: { code: "FORBIDDEN", status: 403, origin: "P0.1" },
  INTERFACE_DEPRECATED: { code: "FORBIDDEN", status: 403 },
  READ_ONLY_INTERFACE: { code: "FORBIDDEN", status: 403 },
  INTERFACE_NOT_ACTIVE: { code: "FORBIDDEN", status: 403 },
  OPERATION_NOT_SUPPORTED: { code: "VALIDATION_ERROR", status: 400 },
  WRITE_NOT_SERVED: { code: "FORBIDDEN", status: 403 },
} as const satisfies Record<AccessRefusal, { code: NorthboundErrorCode; status: number; origin?: string }>;

/**
 * The credential-step reasons (P0.5): the connection's token endpoint failed
 * before any request reached SAP. Recorded in the audit row's failureReason.
 */
const CREDENTIAL_STEP_REASONS: readonly RefusalReasonDoc[] = [
  { reason: "TOKEN_REJECTED", code: "FORBIDDEN", status: 403, origin: "P0.5" },
  { reason: "TOKEN_TIMEOUT", code: "UPSTREAM_TIMEOUT", status: 504, origin: "P0.5" },
  { reason: "TOKEN_HTTP_<status>", code: "UPSTREAM_ERROR", status: 502, origin: "P0.5" },
  { reason: "TOKEN_NO_TOKEN", code: "UPSTREAM_ERROR", status: 502, origin: "P0.5" },
  { reason: "TOKEN_<network code>", code: "UPSTREAM_ERROR", status: 502, origin: "P0.5" },
  { reason: "LIMITER_UNAVAILABLE", code: "LIMITER_UNAVAILABLE", status: 503, origin: "P0.5" },
];

/**
 * The query surface's refusal reasons (P1.4). The caller sees the code and
 * `error.query.rule`; the reason is the pipeline's, recorded on nothing but
 * the status (the rule is in the audit row's `queryRule`).
 */
const QUERY_REASONS = {
  QUERY_INVALID: { code: "VALIDATION_ERROR", status: 400, origin: "P1.4" },
  QUERY_NOT_AVAILABLE: { code: "VALIDATION_ERROR", status: 400, origin: "P1.4" },
  CURSOR_INVALID: { code: "VALIDATION_ERROR", status: 400, origin: "P1.4" },
  POLICY_FIELD_NOT_GRANTED: { code: "POLICY_FIELD_NOT_GRANTED", status: 400, origin: "P1.4" },
  CURSOR_STALE: { code: "CURSOR_STALE", status: 409, origin: "P1.4" },
  QUERY_SURFACE_MISCONFIGURED: { code: "INTERNAL", status: 500, origin: "P1.4" },
} as const satisfies Record<QueryRefusalReason, { code: NorthboundErrorCode; status: number; origin: string }>;

/**
 * Every `error.query.rule` (P1.4, odata/rules.ts), with the code and status
 * it is sent with and what it means, for the OpenAPI document. A Record over
 * the closed union, so a rule added without its line fails the type-check.
 */
export const QUERY_RULES = {
  UNKNOWN_PARAMETER: { code: "VALIDATION_ERROR", status: 400 },
  DUPLICATE_PARAMETER: { code: "VALIDATION_ERROR", status: 400 },
  PARAMETER_CONFLICT: { code: "VALIDATION_ERROR", status: 400 },
  MALFORMED: { code: "VALIDATION_ERROR", status: 400 },
  ODATA_SYNTAX_REFUSED: { code: "VALIDATION_ERROR", status: 400 },
  VALUE_INVALID: { code: "VALIDATION_ERROR", status: 400 },
  VALUE_TOO_LONG: { code: "VALIDATION_ERROR", status: 400 },
  TOO_COMPLEX: { code: "VALIDATION_ERROR", status: 400 },
  NOT_ENABLED: { code: "VALIDATION_ERROR", status: 400 },
  NO_POLICY: { code: "VALIDATION_ERROR", status: 400 },
  POLICY_STALE: { code: "VALIDATION_ERROR", status: 400 },
  NO_CONTRACT: { code: "VALIDATION_ERROR", status: 400 },
  POLICY_UNREADABLE: { code: "VALIDATION_ERROR", status: 400 },
  FIELD_NOT_SELECTABLE: { code: "POLICY_FIELD_NOT_GRANTED", status: 400 },
  FIELD_NOT_FILTERABLE: { code: "POLICY_FIELD_NOT_GRANTED", status: 400 },
  OPERATOR_NOT_ALLOWED: { code: "POLICY_FIELD_NOT_GRANTED", status: 400 },
  FIELD_NOT_SORTABLE: { code: "POLICY_FIELD_NOT_GRANTED", status: 400 },
  FILTER_REQUIRED: { code: "POLICY_FIELD_NOT_GRANTED", status: 400 },
  KEY_LOOKUP_NOT_ALLOWED: { code: "POLICY_FIELD_NOT_GRANTED", status: 400 },
  KEY_INCOMPLETE: { code: "VALIDATION_ERROR", status: 400 },
  KEY_NOT_ADDRESSABLE: { code: "VALIDATION_ERROR", status: 400 },
  COUNT_NOT_ALLOWED: { code: "POLICY_FIELD_NOT_GRANTED", status: 400 },
  PAGE_SIZE_NOT_ALLOWED: { code: "POLICY_FIELD_NOT_GRANTED", status: 400 },
  SAP_URL_TOO_LONG: { code: "VALIDATION_ERROR", status: 400 },
  CURSOR_INVALID: { code: "VALIDATION_ERROR", status: 400 },
  CURSOR_PARAMS_MISMATCH: { code: "VALIDATION_ERROR", status: 400 },
  EXPIRED: { code: "CURSOR_STALE", status: 409 },
  CHANGED: { code: "CURSOR_STALE", status: 409 },
  SAP_REJECTED: { code: "VALIDATION_ERROR", status: 422 },
  ROW_TOO_LARGE: { code: "VALIDATION_ERROR", status: 422 },
  UPSTREAM_PAGE_TOO_LARGE: { code: "VALIDATION_ERROR", status: 422 },
  RESPONSE_TOO_LARGE: { code: "VALIDATION_ERROR", status: 413 },
  UPSTREAM_IGNORED_PAGING: { code: "UPSTREAM_ERROR", status: 502 },
  KEY_NOT_UNIQUE: { code: "UPSTREAM_ERROR", status: 502 },
  TOKEN_RING_UNAVAILABLE: { code: "INTERNAL", status: 500 },
} as const satisfies Record<QueryRule, { code: NorthboundErrorCode; status: number }>;

/** The rules as the OpenAPI lists them: each with its code, status and meaning. */
export const QUERY_RULE_DOCS: readonly { rule: QueryRule; code: NorthboundErrorCode; status: number; meaning: string }[] = (
  Object.keys(QUERY_RULES) as QueryRule[]
).map((rule) => ({ rule, code: QUERY_RULES[rule].code, status: QUERY_RULES[rule].status, meaning: QUERY_RULE_MEANING[rule] }));

/** The governed pipeline's containment refusal (P0.14), recorded in the audit row's failureReason. */
const PIPELINE_REASONS: readonly RefusalReasonDoc[] = [
  { reason: "CIRCUIT_OPEN", code: "CIRCUIT_OPEN", status: 503, origin: "P0.14" },
];

export const NORTHBOUND_REFUSAL_REASONS: readonly RefusalReasonDoc[] = [
  ...Object.entries(AUTH_REASONS).map(([reason, d]) => ({
    reason,
    code: "UNAUTHENTICATED" as const,
    status: 401,
    ...("origin" in d ? { origin: d.origin } : {}),
  })),
  ...Object.entries(ACCESS_REASONS).map(([reason, d]) => ({
    reason,
    code: d.code,
    status: d.status,
    ...("origin" in d ? { origin: d.origin } : {}),
  })),
  ...Object.entries(QUERY_REASONS).map(([reason, d]) => ({ reason, code: d.code, status: d.status, origin: d.origin })),
  ...CREDENTIAL_STEP_REASONS,
  ...PIPELINE_REASONS,
];
