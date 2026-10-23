/**
 * GET /api/northbound/interfaces/[id]/data — the runtime read.
 *
 * This is the endpoint a developer's own application calls. It is the first
 * externally-callable surface in this codebase that serves a client's live SAP
 * data, so every step narrows and none of them trusts request input beyond the
 * token itself:
 *
 *   Bearer token → SHA-256 → SolutionClient (active, unrevoked, unexpired)
 *     → organizationId + solutionId (from the TOKEN, never from the request)
 *       → interface must belong to that solution, in that organization
 *         → an ApiAccessGrant must be approved for this capability, operation
 *           and the client's environment, and not expired
 *           → resolve the client's OWN SapConnection
 *             → contain → read → honest status → audit
 *
 * Each arrow is a step of the governed pipeline (src/lib/governed/pipeline.ts,
 * P0.14), shared with the write, the Test Console run and the Workbench
 * preview; this file is the order the read runs them in.
 *
 * TWO READS ON ONE PATH (P1.4). A request carrying a reserved query name
 * (select, filter.<F>.<op>, orderby, key.<F>, count, pageSize, cursor, and
 * expand, filter and key themselves) is on the QUERY SURFACE: CoreEdge builds
 * the OData query from the request checked against the interface's query
 * policy, pages it with a sealed cursor and caps each page's bytes
 * (queryRead, below). Every other request is the LEGACY READ (`?limit`), and
 * runs exactly as before; its body is serialised once so that one too large
 * for the platform is refused in CoreEdge's own envelope, and audited as
 * refused, instead of failing after a 200 was audited. With
 * COREEDGE_QUERY_SURFACE off, the reserved names are REFUSED, never ignored:
 * an app that filters by customer must never be served every customer.
 *
 * RATE LIMITED PER TOKEN, here and at the edge. An IP key is wrong for this
 * route twice over: a deployed application calls from a handful of server
 * addresses, so an IP key would let one busy customer throttle another, and
 * would let a stolen token hide behind a shared address. Keyed by the resolved
 * client, a runaway or leaked credential throttles only itself — and the audit
 * says exactly which one. The middleware in front is keyed the same way, by
 * the credential presented (audit A43): it used to spend a per-IP bucket on
 * every call, which undid this isolation before the route ran. Its per-IP
 * ceiling is now a high backstop only; a flood of made-up keys is held by the
 * failed-lookup bucket each 401 here spends (northbound/auth-failures.ts).
 */

import type { NextRequest, NextResponse } from "next/server";

import { noteFirstCall } from "@/lib/coreedge/journey";
import { afterResponse } from "@/lib/governed/after-response";
import {
  authenticate,
  authorise,
  bindConnection,
  callSapQuery,
  callSapRead,
  contain,
  GovernedAudit,
  northboundRefusalResponse,
  prefetchedConnectionsFor,
  queryContextFor,
  queryRefusalOf,
  rateLimit,
  resolveReadTarget,
  type Refusal,
  type RefusalAudit,
} from "@/lib/governed/pipeline";
import type { AuthenticatedClient } from "@/lib/northbound/auth";
import type { QueryAuditFields } from "@/lib/northbound/audit";
import {
  checkCursorAfterAuthorise,
  checkCursorConnection,
  checkCursorQuery,
  openCursor,
  type CursorBinding,
  type OpenedCursor,
} from "@/lib/northbound/query/cursor";
import { assembleKey, assemblePage, legacyBody, planPage } from "@/lib/northbound/query/page";
import { querySurfaceGate } from "@/lib/northbound/query/surface";
import { httpStatusFor } from "@/lib/northbound/read";
import { northboundErrorCodeFor } from "@/lib/northbound/read-status";
import { newCorrelationId, northboundError, northboundOkJson } from "@/lib/northbound/respond";
import { currentNorthboundCall, withNorthboundVersion } from "@/lib/northbound/versioned-route";
import { queryHash, queryShape, type QueryAstV1 } from "@/lib/odata/ast";
import { checkPolicyAvailable, checkQuery } from "@/lib/odata/check";
import { QueryCompilerInvariantError } from "@/lib/odata/identifiers";
import { buildQueryUrl, compileQuery } from "@/lib/odata/operation-compiler";
import { parseQueryParams, type ParsedQueryOk } from "@/lib/odata/params";
import { httpStatusForQuery, QUERY_OUTCOME_ANSWER, queryErrorCodeFor, queryRuleForStatus } from "@/lib/odata/query-status";
import { joinQueryFlags, queryRefusal, type QueryFlag, type QueryRefusal, type QueryRule } from "@/lib/odata/rules";
import { RATE_LIMITS, type RateLimitResult } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Served as every supported version of the northbound API, at
 * /api/northbound/* and at /api/northbound/v1/* (which re-exports this):
 * versioned-route.ts resolves CoreEdge-Version, stamps it on the response,
 * and names the version and path on every audit row this call writes (P1.10).
 */
export const GET = withNorthboundVersion(readData);

async function readData(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = newCorrelationId();

  // 1 — authenticate. Every failure mode collapses to one 401 for the caller,
  // and writes no audit row: there is no tenant to write it under.
  const auth = await authenticate(request.headers, correlationId, "northbound");
  if (!auth.ok) return northboundRefusalResponse(auth.refusal, correlationId);
  const client = auth.value;

  const audit = new GovernedAudit({
    organizationId: client.organizationId,
    solutionId: client.solutionId,
    operation: "READ",
    environment: client.environment,
    correlationId,
    clientTokenId: client.clientId,
  });
  const refuse = async (r: Refusal, headers: Record<string, string> = {}) => {
    await audit.refused(r);
    const response = northboundRefusalResponse(r, correlationId);
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  };

  // 1b — throttle THIS credential. Checked after auth so the key is the client,
  // not an address a dozen customers might share. 429 for this credential's
  // own use, 503 when the limiter is down (A44).
  const rate = await rateLimit(`northbound:${client.clientId}`, "Too many requests for this client credential.");
  if (!rate.ok) return refuse(rate.refusal);

  const { id } = await ctx.params;
  audit.about(id, "-");
  // Pure, and before any statement: does the request carry a reserved name?
  const parsed = parseQueryParams(request.nextUrl.searchParams, request.nextUrl.search.length);
  if (!parsed.surface) return legacyRead({ request, id, client, audit, refuse, correlationId });

  const call: QueryCall = { id, client, audit, refuse, correlationId, rateHeaders: rateLimitHeaders(rate.value) };
  if (!parsed.ok) {
    return refuseQuery(
      call,
      "resolveInterface",
      queryRefusal("QUERY_INVALID", parsed.rule, parsed.message, parsed.parameter === undefined ? {} : { parameter: parsed.parameter }),
    );
  }
  return queryRead(call, parsed);
}

/* ── the legacy read: ?limit ──────────────────────────────────────────── */

async function legacyRead(c: {
  request: NextRequest;
  id: string;
  client: AuthenticatedClient;
  audit: GovernedAudit;
  refuse: (r: Refusal) => Promise<NextResponse>;
  correlationId: string;
}): Promise<NextResponse> {
  const { request, id, client, audit, refuse, correlationId } = c;
  const limitParam = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10);
  const limit = Number.isFinite(limitParam) ? limitParam : 10;

  // 2 — authorize: the interface is this solution's, and a live grant covers it.
  const access = await authorise("READ", client.scope, client.solutionId, id, client.environment);
  if (!access.ok) return refuse(access.refusal);
  const iface = access.value;
  audit.about(iface.id, iface.externalId);

  // 3 — resolve the client's OWN SAP connection, BOUND TO THIS CREDENTIAL'S
  // ENVIRONMENT. Never the shared env tenant, and never simply the oldest row:
  // picking by creation order is how a sandbox credential reached production.
  // The binding refusal's reason goes on the row, so the incident engine can
  // tell it apart from a grant-gate 403.
  const bound = await bindConnection(
    client.organizationId,
    iface.sapProduct,
    client.environment,
    "READ",
    client.sapClient,
    prefetchedConnectionsFor(iface),
  );
  if (!bound.ok) return refuse(bound.refusal);
  const { connection } = bound.value;

  /*
   * THE GOVERNED ENTITY SET IS THE ONLY SOURCE (audit E16).
   *
   * The interface's OWN service when it carries one, the catalogue's otherwise
   * — never a fallback from one to the other (see interface-service.ts). The
   * same function decides discovery's `callable` (read-definition.ts, A42).
   *
   * This read `iface.entitySet ?? request.nextUrl.searchParams.get("entity")`.
   * The fallback was there so an interface whose set had not been configured
   * could still be exercised — but a fallback on this path is not a convenience,
   * it is a hole: the grant that authorises the call names a SERVICE, and the
   * entity set decides WHICH DATA inside that service leaves the customer's
   * system. A caller holding a grant for one dataset could name another and the
   * broker would fetch it, because nothing downstream re-checks.
   *
   * `?entity=` is no longer read here at all. An interface with no entity set is
   * a configuration gap and is refused as one, rather than being papered over
   * with whatever the caller happened to ask for. The discovery console
   * (`/api/sap/tdd/preview`) is where a builder chooses a set; that is a
   * different surface, with its own environment ceiling and its own audit row.
   */
  const target = await resolveReadTarget(bound.value.product, iface, connection, (reason) => definitionMessage(reason, iface.draft));
  if (!target.ok) return refuse(target.refusal);
  const { service, entitySet } = target.value;

  // 4 — contain: the circuit breaker for this SAP system. Observes only,
  // unless COREEDGE_CIRCUIT_BREAKER=enforce (lib/governed/containment.ts).
  const circuit = await contain(bound.value, correlationId);
  if (!circuit.ok) return refuse(circuit.refusal);

  // 5 — read, and report exactly what came back.
  //
  // Timed around the UPSTREAM call only. Measuring from the top of the handler
  // would fold our own auth, grant and binding work into a number the operations
  // console labels "how slow is this tenant", which would be a quietly wrong
  // answer to the question actually being asked. Nor the breaker's own store:
  // callSapRead times the executor, before it reports to the breaker.
  const { result, durationMs } = await callSapRead(bound.value, { servicePath: service.path, entitySet, limit }, circuit.value);

  /*
   * THE BODY IS WRITTEN BEFORE THE ROW (P1.4, 3.10.2). The platform returns at
   * most about 4.5 MB; a larger answer used to be audited 200 and then fail
   * with the platform's bare 413. Serialised once here — the same bytes
   * NextResponse.json would send — its size is known before anything is
   * audited, and one past LEGACY_RESPONSE_CAP is refused in CoreEdge's own
   * envelope and audited as what the caller got.
   */
  // 200 for OK *and* EMPTY. An empty resource is a successful read, and the
  // consumer is told so explicitly rather than left to infer it from a count.
  const body =
    result.status === "OK" || result.status === "EMPTY"
      ? legacyBody({
          records: result.records,
          count: result.records.length,
          interface: { id: iface.id, name: iface.name, version: iface.version },
          empty: result.status === "EMPTY",
          note: result.detail,
        })
      : null;
  const tooLarge = body !== null && !body.ok;
  const status = tooLarge ? QUERY_OUTCOME_ANSWER.RESPONSE_TOO_LARGE.status : httpStatusFor(result.status);

  await audit.record(status, {
    // Nothing was served past the guard.
    rowCount: tooLarge ? 0 : result.records.length,
    durationMs,
    // Null connectionEnvironment on a served read is the honest record of a
    // permitted-but-unverified binding: the connection never declared its
    // landscape.
    connection,
    failureReason: result.failureReason,
    // The byte guard's rule and the size it refused; every other legacy row
    // leaves the query columns null.
    ...(tooLarge ? { query: { rule: "RESPONSE_TOO_LARGE", responseBytes: body.bytes } } : {}),
  });
  // The app's first successful call in this environment (P2.12). A set
  // lookup in memory on every call after this instance's first; the one
  // insert it makes runs after the response is sent (P0.19).
  await afterResponse(() =>
    noteFirstCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      environment: connection.environment ?? client.environment,
      channel: "broker",
      status,
    }),
  );

  // The one place the cause and the correlation id meet. The client keeps the
  // generic sentence; whoever is quoted that id can now find out what happened.
  if (result.failureReason) {
    console.warn("[northbound] upstream read failed", {
      correlationId,
      failureReason: result.failureReason,
      httpStatus: result.httpStatus,
      durationMs,
    });
  }

  if (result.status !== "OK" && result.status !== "EMPTY") {
    // The one code table, shared with the recorded fixtures (read.ts, A57).
    return northboundError(northboundErrorCodeFor(result.status), result.detail, status, correlationId);
  }
  if (body === null || !body.ok) {
    const answer = QUERY_OUTCOME_ANSWER.RESPONSE_TOO_LARGE;
    return northboundError(answer.code, answer.message, answer.status, correlationId, {}, { query: { rule: "RESPONSE_TOO_LARGE" } });
  }
  const response = northboundOkJson(body.text, correlationId);
  // A draft interface is SERVED (premature is not wrong) and SAID: the status
  // used to be ignored entirely, so a consumer could build against a contract
  // its builder had not finished. Header rather than body so existing parsers
  // are untouched.
  if (iface.draft) response.headers.set("x-coreedge-interface-status", "DRAFT");
  return response;
}

function definitionMessage(reason: string, draft: boolean): string {
  return reason === "NO_ENTITY_SET"
    ? draft
      ? "This data feed is still a draft and names no dataset yet. Set its entity set in Studio and publish it — the dataset is part of the feed's definition, not something a caller may choose."
      : "This data feed names no dataset. Set its entity set in Studio — the dataset is part of the feed's definition, not something a caller may choose."
    : reason === "SERVICE_PATH_INVALID"
      ? "This interface's own service path is not valid for its product. Fix it in Studio."
      : "The catalogue service for this interface could not be resolved.";
}

/* ── the query surface (P1.4) ─────────────────────────────────────────── */

interface QueryCall {
  readonly id: string;
  readonly client: AuthenticatedClient;
  readonly audit: GovernedAudit;
  readonly refuse: (r: Refusal, headers?: Record<string, string>) => Promise<NextResponse>;
  readonly correlationId: string;
  /** x-ratelimit-limit, -remaining and -reset (seconds), on every query-surface answer (D23). */
  readonly rateHeaders: Readonly<Record<string, string>>;
}

function rateLimitHeaders(rate: RateLimitResult): Record<string, string> {
  return {
    "x-ratelimit-limit": String(RATE_LIMITS.northbound.limit),
    "x-ratelimit-remaining": String(Math.max(0, rate.remaining)),
    "x-ratelimit-reset": String(Math.max(0, Math.ceil(rate.resetMs / 1000))),
  };
}

function refuseQuery(call: QueryCall, step: Refusal["step"], r: QueryRefusal, audit: RefusalAudit = {}): Promise<NextResponse> {
  return call.refuse(queryRefusalOf(step, r, audit), { ...call.rateHeaders });
}

/** What the audit row says of a checked query, on every row after the checker. */
function checkedAudit(ast: QueryAstV1, project: readonly string[], kind: "LIST" | "PAGE" | "KEY", policyRev: string): QueryAuditFields {
  return {
    kind,
    shape: queryShape(ast),
    requestedFields: ast.select === null ? ["*"] : [...project],
    policyRev,
  };
}

async function queryRead(call: QueryCall, parsed: ParsedQueryOk): Promise<NextResponse> {
  const { id, client, audit, correlationId } = call;
  const now = new Date();

  // 3 (Q) — the switch, then the ring: off refuses, never ignores (N14).
  const gate = querySurfaceGate();
  if (!gate.ok) return refuseQuery(call, "resolveInterface", gate);
  const ring = gate.ring;

  // 3 (Q) — a cursor opens in memory, before authorisation and any
  // statement: a forged or copied one costs nothing (N9) and is one refusal.
  const binding: CursorBinding = {
    organizationId: client.organizationId,
    clientId: client.clientId,
    interfaceId: id,
    apiVersion: currentNorthboundCall()?.apiVersion ?? "unversioned",
  };
  let cursor: OpenedCursor | null = null;
  if (parsed.cursor !== null) {
    const opened = openCursor(parsed.cursor, binding, now, ring);
    if (!opened.ok) return refuseQuery(call, "resolveInterface", opened);
    cursor = opened;
  }

  // 4 — authorise, with the compiled policy in the same statement.
  const access = await authorise("READ", client.scope, client.solutionId, id, client.environment, undefined, { withQueryPolicy: true });
  if (!access.ok) return call.refuse(access.refusal, { ...call.rateHeaders });
  const iface = access.value;
  audit.about(iface.id, iface.externalId);
  const context = queryContextFor(iface);
  if (!context) throw new QueryCompilerInvariantError("A query-surface read authorised without its query context.");

  // 5 (Q) — the policy, the cursor's bindings, then the query itself. After
  // the grant, so a caller without one learns nothing about the policy.
  const available = checkPolicyAvailable(context.policyRaw, { entitySet: iface.entitySet, sourcePresent: context.policySourcePresent });
  if (!available.ok) return refuseQuery(call, "authorise", available);
  const { policy } = available;
  if (cursor !== null) {
    const changed = checkCursorAfterAuthorise(cursor.payload, {
      interfaceVersion: iface.version,
      policy: policy.compiled,
      authorisingGrantIds: context.authorisingGrantIds,
    });
    if (changed) return refuseQuery(call, "authorise", changed);
  }
  const checked = checkQuery(parsed, policy);
  if (!checked.ok) return refuseQuery(call, "authorise", checked);
  const { ast, project } = checked;
  const kind = ast.kind === "KEY" ? "KEY" : cursor === null ? "LIST" : "PAGE";
  const base = checkedAudit(ast, project, kind, policy.compiled.rev);
  if (cursor !== null) {
    const mismatch = checkCursorQuery(cursor.payload, ast);
    if (mismatch) return refuseQuery(call, "authorise", mismatch, { query: base });
  }

  // 6 — the client's OWN connection, as on the legacy read; then the cursor's.
  const bound = await bindConnection(client.organizationId, iface.sapProduct, client.environment, "READ", client.sapClient, prefetchedConnectionsFor(iface));
  if (!bound.ok) return call.refuse(bound.refusal, { ...call.rateHeaders });
  const { connection } = bound.value;
  const connectionRef = { id: connection.id, revision: connection.revision ?? 0 };
  if (cursor !== null) {
    const moved = checkCursorConnection(cursor.payload, connectionRef);
    if (moved) return refuseQuery(call, "bindConnection", moved, { connection, query: base });
  }

  // 7 — the governed entity set, as on the legacy read; it must be the one the policy describes.
  const target = await resolveReadTarget(bound.value.product, iface, connection, (reason) => definitionMessage(reason, iface.draft));
  if (!target.ok) return call.refuse(target.refusal, { ...call.rateHeaders });
  const { service, entitySet } = target.value;
  if (entitySet !== policy.compiled.entitySet) {
    return refuseQuery(
      call,
      "authorise",
      queryRefusal("QUERY_NOT_AVAILABLE", "POLICY_STALE", "This interface's query policy no longer matches its contract; its builder must review it in Studio."),
      { connection, query: base },
    );
  }

  // 8 (Q) — the OData query, from the checked AST only, through buildSapUrl,
  // measured as fetch sends it.
  let plan: ReturnType<typeof planPage> | null;
  let built: ReturnType<typeof buildQueryUrl>;
  try {
    plan = ast.kind === "LIST" ? planPage(policy, ast, cursor?.payload ?? null) : null;
    const sapQuery = compileQuery(ast, policy, plan === null ? { skip: 0, top: null, page0: true } : { skip: plan.skip, top: plan.ask, page0: plan.page0 }, project);
    built = buildQueryUrl(sapQuery, { baseUrl: connection.baseUrl, servicePath: service.path, entitySet, client: connection.client });
  } catch (err) {
    if (!(err instanceof QueryCompilerInvariantError)) throw err;
    // A defect, never the caller's: nothing is sent to SAP.
    console.error("[northbound] query not compiled", { correlationId, error: err.message });
    await audit.record(500, { connection, query: base });
    return northboundError("INTERNAL", "CoreEdge could not build this query. Nothing was sent to SAP.", 500, correlationId, { ...call.rateHeaders });
  }
  if (!built.ok) return refuseQuery(call, "resolveInterface", built, { connection, query: base });

  // 9 — contain, as on the legacy read.
  const circuit = await contain(bound.value, correlationId);
  if (!circuit.ok) return call.refuse({ ...circuit.refusal, audit: { ...circuit.refusal.audit, query: base } }, { ...call.rateHeaders });

  // 10 (Q) — the read, its outcome reported by the query's own circuit rule.
  const countAsked = plan !== null && plan.page0 && ast.count;
  const { result, durationMs } = await callSapQuery(bound.value, { built: { url: built.url, query: built.query }, countAsked }, circuit.value);
  const sentFlags: readonly QueryFlag[] = built.query.flags;
  if (result.failureReason) {
    console.warn("[northbound] upstream query failed", { correlationId, failureReason: result.failureReason, httpStatus: result.httpStatus, durationMs });
  }

  const hash = queryHash(ast, { organizationId: client.organizationId, interfaceId: iface.id }, ring);
  const finish = async (status: number, extras: { rowCount: number; failureReason: string | null; query: QueryAuditFields }) => {
    await audit.record(status, { rowCount: extras.rowCount, durationMs, connection, failureReason: extras.failureReason, query: { ...base, hash, ...extras.query } });
    await afterResponse(() =>
      noteFirstCall({
        organizationId: client.organizationId,
        solutionId: client.solutionId,
        environment: connection.environment ?? client.environment,
        channel: "broker",
        status,
      }),
    );
  };
  const failed = async (status: number, code: Parameters<typeof northboundError>[0], message: string, rule: QueryRule | null, extras: { failureReason: string | null; flags: readonly QueryFlag[]; chainId?: string }) => {
    await finish(status, {
      rowCount: 0,
      failureReason: extras.failureReason,
      query: { rule, flags: joinQueryFlags([...sentFlags, ...extras.flags]), ...(extras.chainId === undefined ? {} : { chainId: extras.chainId, pageIndex: plan?.pageIndex ?? 0 }) },
    });
    return northboundError(code, message, status, correlationId, { ...call.rateHeaders }, rule === null ? undefined : { query: { rule } });
  };

  // 11 (Q) — what SAP answered: an outcome of its own, or the rows.
  if (result.answer === null) {
    const status = httpStatusForQuery(result.status);
    const code = queryErrorCodeFor(result.status as Exclude<typeof result.status, "OK" | "EMPTY">);
    return failed(status, code, result.detail, queryRuleForStatus(result.status), { failureReason: result.failureReason, flags: [] });
  }

  // 12 (Q) — the page or the record, from SAP's rows. An invariant broken here
  // is CoreEdge's defect, never the caller's: SAP was asked, so the row says
  // what was sent, and no row of SAP's reaches the caller.
  let assembled:
    | { readonly page: ReturnType<typeof assemblePage>; readonly plan: NonNullable<typeof plan> }
    | { readonly key: ReturnType<typeof assembleKey> };
  try {
    assembled =
      plan !== null
        ? {
            plan,
            page: assemblePage({
              policy,
              ast,
              plan,
              cursor,
              answer: result.answer,
              binding,
              ring,
              now,
              interface: { id: iface.id, name: iface.name, version: iface.version },
              connection: connectionRef,
              authorisingGrantIds: context.authorisingGrantIds,
            }),
          }
        : {
            key: assembleKey({
              policy,
              kind: built.query.kind === "KEY_VIA_FILTER" ? "KEY_VIA_FILTER" : "KEY",
              answer: result.answer,
              interface: { id: iface.id, name: iface.name, version: iface.version },
            }),
          };
  } catch (err) {
    if (!(err instanceof QueryCompilerInvariantError)) throw err;
    console.error("[northbound] query answer not assembled", { correlationId, error: err.message });
    await finish(500, { rowCount: 0, failureReason: null, query: { flags: joinQueryFlags(sentFlags) } });
    return northboundError("INTERNAL", "CoreEdge could not assemble SAP's answer. No rows were served.", 500, correlationId, { ...call.rateHeaders });
  }

  let text: string;
  if ("page" in assembled) {
    const { page, plan } = assembled;
    if (!page.ok) {
      const answer = QUERY_OUTCOME_ANSWER[page.rule];
      return failed(answer.status, answer.code, answer.message, page.rule, { failureReason: answer.failureReason, flags: page.flags, chainId: page.chainId });
    }
    await finish(200, {
      rowCount: page.served,
      failureReason: null,
      query: {
        chainId: page.chainId,
        pageIndex: plan.pageIndex,
        chainRows: page.chainRows,
        responseBytes: page.bytes,
        flags: joinQueryFlags([...sentFlags, ...page.flags]),
      },
    });
    text = page.body;
  } else {
    const { key } = assembled;
    if (!key.ok) {
      if (key.outcome === "NO_RECORD") {
        return failed(404, "RECORD_NOT_FOUND", "SAP has no record with this key.", null, { failureReason: null, flags: key.flags });
      }
      const answer = QUERY_OUTCOME_ANSWER[key.outcome];
      return failed(answer.status, answer.code, answer.message, key.outcome, { failureReason: answer.failureReason, flags: key.flags });
    }
    await finish(200, { rowCount: 1, failureReason: null, query: { responseBytes: key.bytes, flags: joinQueryFlags([...sentFlags, ...key.flags]) } });
    text = key.body;
  }

  // 14 — the page, as written within its byte cap.
  const response = northboundOkJson(text, correlationId);
  for (const [name, value] of Object.entries(call.rateHeaders)) response.headers.set(name, value);
  if (iface.draft) response.headers.set("x-coreedge-interface-status", "DRAFT");
  return response;
}
