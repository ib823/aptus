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
    statuses: [403],
    meaning: "The customer's SAP connection cannot be bound for this credential's environment yet.",
    action: "Ask the customer to finish connecting their SAP system. Do not retry.",
  },
  NOT_FOUND: {
    statuses: [404],
    meaning:
      "No interface with this id belongs to the solution this token was issued for, or the SAP system answered that the dataset does not exist.",
    action: "Fix the interface id or its configuration. Do not retry.",
  },
  VALIDATION_ERROR: {
    statuses: [400, 422],
    meaning:
      "400: the request or the interface's definition cannot be used as it stands (no dataset, an invalid service path, a missing Idempotency-Key, a body that is not { record }, an unverified own service). 422: SAP rejected the record itself.",
    action: "Fix the request or the interface. Do not retry unchanged.",
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
  UPSTREAM_TIMEOUT: {
    statuses: [504],
    meaning: "The SAP system, or the connection's token endpoint, did not answer in time.",
    action: "Retry; for a write, retry with the same Idempotency-Key.",
  },
  UPSTREAM_ERROR: {
    statuses: [502],
    meaning: "The SAP system, or the connection's token endpoint, failed or answered in a way the broker could not use.",
    action: "Retry or escalate with the correlation id.",
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
  ...CREDENTIAL_STEP_REASONS,
];
