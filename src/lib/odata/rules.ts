/**
 * The query surface's vocabulary of refusals (P1.4).
 *
 * TWO LEVELS, ON PURPOSE. A refusal has a REASON, which decides the HTTP
 * status and the error code (`QUERY_REFUSAL_STATUS` below, spread into the
 * pipeline's refusal table), and a RULE, which says which part of the query
 * was refused and travels in `error.query.rule`. Three error codes cover the
 * caller's decisions (fix the query, start the chain again, the record is not
 * there); the rule says what to fix without one code per cause.
 *
 * THE AUDIT SEES A LITTLE MORE. A cursor refusal is told to the caller as one
 * thing, CURSOR_INVALID, whatever failed: a forged cursor and a cursor from
 * another client must be indistinguishable, or the difference is an oracle.
 * The audit row's `queryRule` keeps which check failed (CURSOR_AUDIT_RULES),
 * because operations needs it and the caller never sees it.
 *
 * Nothing here holds a value the caller sent. Names are echoed only when they
 * match the identifier grammar, and parameters only when they match a
 * conservative pattern; messages are written with neither values nor SAP's
 * text, a URL or a host.
 */

/** The rules a query refusal or outcome names in `error.query.rule`. Closed. */
export const QUERY_RULE_LIST = [
  "UNKNOWN_PARAMETER",
  "DUPLICATE_PARAMETER",
  "PARAMETER_CONFLICT",
  "MALFORMED",
  "ODATA_SYNTAX_REFUSED",
  "VALUE_INVALID",
  "VALUE_TOO_LONG",
  "TOO_COMPLEX",
  "NOT_ENABLED",
  "NO_POLICY",
  "POLICY_STALE",
  "NO_CONTRACT",
  "POLICY_UNREADABLE",
  "FIELD_NOT_SELECTABLE",
  "FIELD_NOT_FILTERABLE",
  "OPERATOR_NOT_ALLOWED",
  "FIELD_NOT_SORTABLE",
  "FILTER_REQUIRED",
  "KEY_LOOKUP_NOT_ALLOWED",
  "KEY_INCOMPLETE",
  "KEY_NOT_ADDRESSABLE",
  "COUNT_NOT_ALLOWED",
  "PAGE_SIZE_NOT_ALLOWED",
  "SAP_URL_TOO_LONG",
  "CURSOR_INVALID",
  "CURSOR_PARAMS_MISMATCH",
  "EXPIRED",
  "CHANGED",
  "SAP_REJECTED",
  "ROW_TOO_LARGE",
  "UPSTREAM_PAGE_TOO_LARGE",
  "RESPONSE_TOO_LARGE",
  "UPSTREAM_IGNORED_PAGING",
  "KEY_NOT_UNIQUE",
  "TOKEN_RING_UNAVAILABLE",
] as const;

export type QueryRule = (typeof QUERY_RULE_LIST)[number];

export function isQueryRule(value: string): value is QueryRule {
  return (QUERY_RULE_LIST as readonly string[]).includes(value);
}

/**
 * What each rule means, one line each, for the OpenAPI document and the
 * northbound error table. A Record, so a rule added above without a meaning
 * is a type error here.
 */
export const QUERY_RULE_MEANING: Record<QueryRule, string> = {
  UNKNOWN_PARAMETER: "A query parameter this interface does not define: not one of select, filter.<Field>.<op>, orderby, key.<Field>, count, pageSize or cursor.",
  DUPLICATE_PARAMETER: "A parameter was sent more than once. Only filter.<Field>.in repeats.",
  PARAMETER_CONFLICT: "Parameters that cannot be combined: key.* with anything but select, cursor with key.*, or two predicates on one field.",
  MALFORMED: "A parameter name or value does not follow its grammar.",
  ODATA_SYNTAX_REFUSED: "Raw OData options ($filter, $top, …) are not accepted on the query surface; CoreEdge builds the OData query itself.",
  VALUE_INVALID: "A value is not of the form its field's type requires, or contains characters that are not accepted.",
  VALUE_TOO_LONG: "A value is longer than its field or the query surface allows.",
  TOO_COMPLEX: "The query has more fields, values or literal text than the query surface allows.",
  NOT_ENABLED: "This deployment does not serve query parameters yet.",
  NO_POLICY: "The interface has no query policy, so it serves no query parameters.",
  POLICY_STALE: "The interface's query policy no longer matches its contract; its builder must review it.",
  NO_CONTRACT: "The interface's contract changed and has not been verified since; its builder must verify the service.",
  POLICY_UNREADABLE: "The interface's compiled query policy cannot be read.",
  FIELD_NOT_SELECTABLE: "A selected field is not readable under the query policy.",
  FIELD_NOT_FILTERABLE: "A filtered field is not filterable under the query policy.",
  OPERATOR_NOT_ALLOWED: "A filter operator is not allowed on its field under the query policy.",
  FIELD_NOT_SORTABLE: "An orderby field is not sortable under the query policy.",
  FILTER_REQUIRED: "The query policy, or SAP, requires a filter the query does not have.",
  KEY_LOOKUP_NOT_ALLOWED: "The query policy does not allow key lookup.",
  KEY_INCOMPLETE: "A key lookup must name every key field exactly once, and nothing else.",
  KEY_NOT_ADDRESSABLE: "This key value cannot be addressed on this service.",
  COUNT_NOT_ALLOWED: "The query policy does not allow count=true.",
  PAGE_SIZE_NOT_ALLOWED: "pageSize is above the query policy's maximum.",
  SAP_URL_TOO_LONG: "The OData query CoreEdge would send is longer than SAP accepts; ask for fewer values.",
  CURSOR_INVALID: "The cursor cannot be used; start again from the first page.",
  CURSOR_PARAMS_MISMATCH: "A cursor must be sent with the same other parameters as the first page.",
  EXPIRED: "The cursor, or its paging run, has expired; start again from the first page.",
  CHANGED: "The interface, its query policy, its grant or its connection changed since the first page; start again.",
  SAP_REJECTED: "The SAP service refused the query CoreEdge sent; change the query, as retrying it unchanged will not help.",
  ROW_TOO_LARGE: "One record is larger than the interface's page limit; select fewer fields.",
  UPSTREAM_PAGE_TOO_LARGE: "SAP's answer to this page was larger than CoreEdge reads; ask for a smaller pageSize or fewer fields.",
  RESPONSE_TOO_LARGE: "The answer is larger than CoreEdge can return; ask for fewer records.",
  UPSTREAM_IGNORED_PAGING: "The SAP service did not honour the paging CoreEdge asked for; retrying will not help.",
  KEY_NOT_UNIQUE: "The SAP service returned more than one record for one key; retrying will not help.",
  TOKEN_RING_UNAVAILABLE: "This deployment's token keys cannot be read, so it cannot serve queries.",
};

/**
 * Which cursor check failed, for the audit row only. The caller is told
 * CURSOR_INVALID, EXPIRED or CHANGED (above).
 */
export const CURSOR_AUDIT_RULES = [
  "CURSOR_MALFORMED",
  "CURSOR_KEY_UNKNOWN",
  "CURSOR_UNOPENED",
  "CURSOR_EXPIRED",
  "CURSOR_CHAIN_EXPIRED",
  "CURSOR_INTERFACE_CHANGED",
  "CURSOR_POLICY_CHANGED",
  "CURSOR_GRANT_CHANGED",
  "CURSOR_CONNECTION_CHANGED",
] as const;

export type CursorAuditRule = (typeof CURSOR_AUDIT_RULES)[number];

/** What the audit row's `queryRule` holds. */
export type QueryAuditRule = QueryRule | CursorAuditRule;

/** The audit column's own shape check, held at the one writer. */
export const QUERY_AUDIT_RULE_PATTERN = /^[A-Z][A-Z0-9_]{1,40}$/;

/**
 * The audit row's `queryFlags`: what happened on a page that the status does
 * not say. Closed, so a flag is never free text.
 */
export const QUERY_FLAG_LIST = [
  "CUT_BY_BYTES",
  "ADAPTIVE_TOP",
  "ROW_CAP",
  "PROJECTED",
  "TOP_NOT_HONOURED",
  "SKIP_NOT_HONOURED",
  "PINNED_ACTIVE",
  "KEY_VIA_FILTER",
  "SELECT_DROPPED",
] as const;

export type QueryFlag = (typeof QUERY_FLAG_LIST)[number];

/** Comma-joined in the list's own order, so equal sets give equal text. */
export function joinQueryFlags(flags: Iterable<QueryFlag>): string | null {
  const set = new Set(flags);
  const out = QUERY_FLAG_LIST.filter((f) => set.has(f));
  return out.length === 0 ? null : out.join(",");
}

/**
 * The reasons a query is refused before or instead of reaching SAP. Each is
 * a pipeline refusal reason; the statuses are spread into the pipeline's
 * refusal table.
 */
export type QueryRefusalReason =
  | "QUERY_INVALID"
  | "QUERY_NOT_AVAILABLE"
  | "CURSOR_INVALID"
  | "POLICY_FIELD_NOT_GRANTED"
  | "CURSOR_STALE"
  | "QUERY_SURFACE_MISCONFIGURED";

export const QUERY_REFUSAL_STATUS: Record<QueryRefusalReason, number> = {
  QUERY_INVALID: 400,
  QUERY_NOT_AVAILABLE: 400,
  CURSOR_INVALID: 400,
  POLICY_FIELD_NOT_GRANTED: 400,
  CURSOR_STALE: 409,
  QUERY_SURFACE_MISCONFIGURED: 500,
};

/** `error.query`: additive detail beside the code and message. */
export interface QueryRefusalDetail {
  readonly rule: QueryRule;
  /** The parameter refused, when it is safe to echo (echoParameter). */
  readonly parameter?: string;
  /** The field refused; always an identifier, so always safe to echo. */
  readonly field?: string;
  /** At most ALLOWED_ECHO_MAX names from the policy's relevant list. */
  readonly allowed?: readonly string[];
}

export interface QueryRefusal {
  readonly ok: false;
  readonly reason: QueryRefusalReason;
  /** Safe for the caller: no value, no SAP text, no URL, no host. */
  readonly message: string;
  readonly detail: QueryRefusalDetail;
  /** The audit row's queryRule, when it says more than detail.rule (a cursor check). */
  readonly auditRule?: QueryAuditRule;
}

/** The most names a refusal's `allowed` carries. The caller's OpenAPI lists them all. */
export const ALLOWED_ECHO_MAX = 20;

/** A parameter name in `error.query.parameter`: ASCII, no space, no quote, no `&` or `=`. */
const PARAMETER_ECHO_PATTERN = /^[A-Za-z0-9_.$-]{1,140}$/;

/** A parameter name the caller sent, or undefined when it is not safe to echo. */
export function echoParameter(name: string, maxLength = 140): string | undefined {
  return name.length <= maxLength && PARAMETER_ECHO_PATTERN.test(name) ? name : undefined;
}

export function queryRefusal(
  reason: QueryRefusalReason,
  rule: QueryRule,
  message: string,
  extras: { parameter?: string | undefined; field?: string | undefined; allowed?: readonly string[] | undefined; auditRule?: QueryAuditRule | undefined } = {},
): QueryRefusal {
  const detail: { rule: QueryRule; parameter?: string; field?: string; allowed?: readonly string[] } = { rule };
  const parameter = extras.parameter === undefined ? undefined : echoParameter(extras.parameter);
  if (parameter !== undefined) detail.parameter = parameter;
  if (extras.field !== undefined) detail.field = extras.field;
  if (extras.allowed !== undefined) detail.allowed = extras.allowed.slice(0, ALLOWED_ECHO_MAX);
  const refusal: { ok: false; reason: QueryRefusalReason; message: string; detail: QueryRefusalDetail; auditRule?: QueryAuditRule } = {
    ok: false,
    reason,
    message,
    detail,
  };
  if (extras.auditRule !== undefined) refusal.auditRule = extras.auditRule;
  return refusal;
}

/** The rule the audit row records for a refusal: the finer cursor check when there is one. */
export function auditRuleOf(refusal: QueryRefusal): QueryAuditRule {
  return refusal.auditRule ?? refusal.detail.rule;
}
