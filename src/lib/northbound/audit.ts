/**
 * Per-call audit for the northbound broker.
 *
 * Every call to a client's SAP system leaves a row: which solution, which
 * interface, what came back, and — crucially — WHICH TOKEN was used. That last
 * field is what makes a leaked credential actionable: you can see exactly what
 * it touched and revoke precisely it, rather than rotating everything and hoping.
 *
 * APPEND-ONLY BY CONSTRUCTION: this module exposes a write and nothing else.
 * There is deliberately no update or delete helper, because an audit trail that
 * can be edited is not an audit trail.
 *
 * Failures are FAILURES too. A 403 or a timeout is recorded exactly like a
 * success — an audit that only shows the calls that worked would hide the very
 * pattern (repeated denials from one token) that indicates something is wrong.
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { currentNorthboundCall } from "@/lib/northbound/versioned-route";
import { QUERY_SHAPE_MAX } from "@/lib/odata/ast";
import { QUERY_AUDIT_RULE_PATTERN, QUERY_FLAG_LIST } from "@/lib/odata/rules";

/**
 * What a query-surface call adds to its row (P1.4, 3.12), in the same insert.
 * Every field optional: a refusal before the query was checked carries only
 * its rule; a legacy read's byte guard only its rule and size.
 */
export interface QueryAuditFields {
  /** LIST (a chain's first page), PAGE (a cursor page) or KEY. */
  readonly kind?: "LIST" | "PAGE" | "KEY" | null;
  /** odata/ast.ts queryShape: no literal in it. */
  readonly shape?: string | null;
  /** odata/ast.ts queryHash: keyed per organisation. */
  readonly hash?: string | null;
  /** The effective fields that left CoreEdge, or ["*"] when no select was sent. */
  readonly requestedFields?: readonly string[] | null;
  readonly policyRev?: string | null;
  readonly chainId?: string | null;
  readonly pageIndex?: number | null;
  readonly chainRows?: number | null;
  readonly responseBytes?: number | null;
  /** A QueryRule, or the cursor check that failed (rules.ts QueryAuditRule). */
  readonly rule?: string | null;
  /** rules.ts joinQueryFlags. */
  readonly flags?: string | null;
}

const MAX_REQUESTED_FIELDS = 256;
const FLAG_SET = new Set<string>(QUERY_FLAG_LIST);

/**
 * The query columns as written. The bounds are held here, at the one writer:
 * a rule that is not a rule, a flag outside the closed set or an over-long
 * shape is a defect, and is written as null (and logged) rather than as text
 * the columns' readers do not expect.
 */
function queryColumns(q: QueryAuditFields, correlationId: string) {
  const rule = q.rule ?? null;
  const ruleOk = rule === null || QUERY_AUDIT_RULE_PATTERN.test(rule);
  const flags = q.flags ?? null;
  const flagsOk = flags === null || flags.split(",").every((f) => FLAG_SET.has(f));
  const shape = q.shape ?? null;
  const shapeOk = shape === null || shape.length <= QUERY_SHAPE_MAX;
  const fields = q.requestedFields ?? null;
  if (!ruleOk || !flagsOk || !shapeOk) {
    console.error("[northbound-audit] query columns out of bounds", { correlationId, ruleOk, flagsOk, shapeOk });
  }
  return {
    queryKind: q.kind ?? null,
    queryShape: shapeOk ? shape : null,
    queryHash: q.hash ?? null,
    ...(fields === null ? {} : { requestedFields: fields.slice(0, MAX_REQUESTED_FIELDS) as Prisma.InputJsonValue }),
    queryPolicyRev: q.policyRev ?? null,
    cursorChainId: q.chainId ?? null,
    pageIndex: q.pageIndex ?? null,
    chainRows: q.chainRows ?? null,
    responseBytes: q.responseBytes ?? null,
    queryRule: ruleOk ? rule : null,
    queryFlags: flagsOk ? flags : null,
  };
}

export interface NorthboundAuditInput {
  organizationId: string;
  /**
   * The solution that made the call, or null when no solution did.
   *
   * Null is the CONSOLE READ case — `/api/sap/tdd/*`, where a signed-in human
   * causes a live read with no solution and no credential in the request. Those
   * rows carry `actorUserId` instead; see `recordConsoleRead`.
   */
  solutionId: string | null;
  interfaceId: string | null;
  operation: "READ" | "WRITE";
  externalId: string;
  environment: string;
  /** The HTTP status returned to the CALLER — what actually happened. */
  status: number;
  rowCount: number | null;
  correlationId: string;
  /** The credential presented, or null on a console read. */
  clientTokenId: string | null;
  /**
   * The user who caused this read, when a human did.
   *
   * Exactly one of `clientTokenId` and `actorUserId` is set on every row: a
   * machine names its credential, a human names themselves. A row with neither
   * is a call nobody is accountable for, which is the thing this column exists
   * to make unwritable.
   */
  actorUserId?: string | null;
  /**
   * Which SapConnection served the call, and the landscape that row declared.
   *
   * `environment` above is the CREDENTIAL's declared environment; these are the
   * CONNECTION's. Both are recorded because only the pair can show they agreed —
   * before the binding fix the broker could serve a PROD connection while the
   * audit row sincerely said "SANDBOX", and nothing in the trail could reveal it.
   *
   * Null on calls that never reached a connection (refused at auth, throttle, or
   * the grant gate). `connectionEnvironment` null on a SERVED read means the
   * binding was permitted but unverified — the connection had declared no
   * landscape.
   */
  connectionId?: string | null;
  connectionEnvironment?: string | null;
  /**
   * Wall-clock milliseconds the UPSTREAM call took.
   *
   * Null when no upstream call was made — refused at auth, throttle, the grant
   * gate or the connection binding. That is the honest value: there is no
   * duration for a request that never left. A zero would claim the opposite.
   */
  durationMs?: number | null;
  /**
   * Why the broker refused before reaching a connection, if it did.
   *
   * A binding refusal audits as HTTP 403 with a null connection — which is also
   * exactly what a grant-gate refusal looks like. Without this field the one
   * event meaning "no connection serves the environment this credential asked
   * for" is indistinguishable from "you have no grant", and nothing can score
   * it. That is why the only CRITICAL rule the product had watched a comparison
   * that could never be unequal instead.
   */
  bindingRefusal?: string | null;
  /**
   * TRUE for a Test Console broker dry-run — the same pipeline exercised from
   * Studio. Recorded, never omitted: it is real traffic on a real tenant.
   */
  dryRun?: boolean;
  /**
   * TRUE when the write route answered by REPLAYING the outcome stored under
   * the call's Idempotency-Key — SAP was not called again. Recorded, never
   * omitted, like a dry run; but a replay is not a second write, a second
   * upstream error or a refusal, and before this field nothing downstream
   * could tell it from one. See the column in schema.prisma.
   */
  replayed?: boolean;
  /**
   * WHY the upstream call failed, as a bounded code — ENOTFOUND, ECONNREFUSED,
   * CERT_HAS_EXPIRED, TIMEOUT, HTTP_503 — or null when it did not fail, or was
   * never made. Never the host, the URL or the error text.
   *
   * Before this column the cause was discarded at the catch block: a 502 audited
   * as a bare 502, and the correlation id the caller was told to quote led an
   * operator to a row that could not say why. DNS failure, an expired
   * certificate, a refused connection and a genuine SAP 500 were one thing. As
   * a bounded code the reason is also COUNTABLE — "nine tenants failed TLS this
   * morning" is a different alert from "nine tenants returned 500", and neither
   * sentence could be said.
   */
  failureReason?: string | null;
  /**
   * Which dated version of the northbound API served the call ("2026-10"),
   * and which base path it came in on ("/api/northbound/v1" or the original
   * "/api/northbound"). P1.10.
   *
   * Omitted by every route: inside a northbound call they come from the
   * context the version wrapper opens (versioned-route.ts), so the rows the
   * many call sites write are stamped without one of them changing, and
   * without a query. Null outside one — a console read, a Test Console dry
   * run — because no northbound version served those.
   */
  apiVersion?: string | null;
  apiBasePath?: string | null;
  /**
   * The query surface's columns (P1.4). Absent on every call that is not on
   * it — a legacy read, a write, a console read — whose row then leaves all
   * eleven null, exactly as before.
   */
  query?: QueryAuditFields;
}

export async function recordNorthboundCall(input: NorthboundAuditInput): Promise<void> {
  const served = currentNorthboundCall();
  try {
    await prisma.northboundAuditEvent.create({
      data: {
        bindingRefusal: input.bindingRefusal ?? null,
        dryRun: input.dryRun ?? false,
        replayed: input.replayed ?? false,
        organizationId: input.organizationId,
        solutionId: input.solutionId,
        interfaceId: input.interfaceId,
        operation: input.operation,
        externalId: input.externalId,
        environment: input.environment,
        status: input.status,
        rowCount: input.rowCount,
        correlationId: input.correlationId,
        clientTokenId: input.clientTokenId,
        actorUserId: input.actorUserId ?? null,
        connectionId: input.connectionId ?? null,
        connectionEnvironment: input.connectionEnvironment ?? null,
        durationMs: input.durationMs ?? null,
        failureReason: input.failureReason ?? null,
        apiVersion: input.apiVersion ?? served?.apiVersion ?? null,
        apiBasePath: input.apiBasePath ?? served?.apiBasePath ?? null,
        ...(input.query === undefined ? {} : queryColumns(input.query, input.correlationId)),
      },
    });
  } catch (err) {
    // Loud, but never fatal: losing the caller's data because the audit row
    // failed would be a worse outcome than a visible gap in the trail.
    console.error("[northbound-audit] failed to record call", {
      correlationId: input.correlationId,
      clientTokenId: input.clientTokenId,
      err,
    });
  }
}
