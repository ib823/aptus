/**
 * POST /api/studio/test/broker-run — the Test Console's run, THROUGH the broker.
 *
 * WHY THIS EXISTS. The Test Console used to call /api/sap/tdd/entities and
 * /preview: role-gated env-tenant reads with no grant check, no environment
 * binding, no sapClient, and no northbound audit row. A green console proved
 * nothing about whether the deployed application's call would succeed — and
 * could even send the shared demo tenant's credentials toward a customer's
 * declared baseUrl, the mirror image of the failure read.ts exists to prevent.
 * The manual meanwhile promised "against the connection this solution would
 * actually use".
 *
 * THIS ROUTE RUNS THE REAL PIPELINE, server-side, using the solution's own
 * runtime credential ROW as the identity (the raw bearer token is hashed and
 * unrecoverable — the console never re-presents it; it resolves the same facts
 * the token would resolve to): the same resolveReadableInterface grant check,
 * the same environment+sapClient connection binding, the same readEntitySet,
 * and a NorthboundAuditEvent with dryRun: true. Every refusal returned here is
 * the refusal the deployed app would see, stated as such — a teaching surface,
 * not a bypass.
 *
 * AND THE QUERY THE APP WOULD SEND (P1.4). With `query`, the run is a
 * query-surface read: the same parser, the same policy check after the grant,
 * the same compiler, executor and page assembly the data route uses, so a
 * refusal here is the refusal the app would get, with the same
 * `error.query` detail. Two differences, both because the console shows one
 * page to a person: it runs the FIRST page only (a cursor is refused, and
 * none is issued), at most CONSOLE_MAX_PAGE rows. Its answer carries the
 * query's own outcome (`queryStatus`) and no `status`, so the screen offers
 * no schema or fixture capture for it (the capture job refuses a run it does
 * not know), and shows what was sent as the service path and options only:
 * never the host.
 */

import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { noteFirstCall } from "@/lib/coreedge/journey";
import { prisma } from "@/lib/db/prisma";
import {
  authorise,
  bindConnection,
  callSapQuery,
  callSapRead,
  contain,
  GovernedAudit,
  prefetchedConnectionsFor,
  queryContextFor,
  queryRefusalOf,
  rateLimit,
  refusal,
  resolveReadTarget,
  type PipelineStep,
  type RefusalAudit,
} from "@/lib/governed/pipeline";
import { checkSolutionRuntime, touchClientLastUsed } from "@/lib/northbound/auth";
import type { QueryAuditFields } from "@/lib/northbound/audit";
import { assembleKey, assemblePage, planPage, type PageInfo } from "@/lib/northbound/query/page";
import { querySurfaceGate } from "@/lib/northbound/query/surface";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { httpStatusFor } from "@/lib/northbound/read";
import { newCorrelationId } from "@/lib/northbound/respond";
import { queryHash, queryShape } from "@/lib/odata/ast";
import { checkPolicyAvailable, checkQuery } from "@/lib/odata/check";
import { QueryCompilerInvariantError } from "@/lib/odata/identifiers";
import { buildQueryUrl, compileQuery, sentLine, type SapQueryKind } from "@/lib/odata/operation-compiler";
import { parseQueryParams, type ParsedQuery } from "@/lib/odata/params";
import { httpStatusForQuery, QUERY_OUTCOME_ANSWER, queryRuleForStatus, type QueryReadStatus } from "@/lib/odata/query-status";
import { joinQueryFlags, queryRefusal, type QueryFlag, type QueryRefusal, type QueryRefusalDetail, type QueryRule } from "@/lib/odata/rules";
import { LIMITER_UNAVAILABLE_MESSAGE } from "@/lib/security/rate-limit-response";
import { consoleReadRefusalMessage } from "@/lib/sap-public/console-read-guard";
import { parseSapEnvironment } from "@/lib/sap-public/environment";
import { studioError, studioOk } from "@/lib/studio/api";
import { canAccessStudio, isSandboxDeveloper, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { scopedById, scopedWhere, tenantScopeFor, type TenantScope } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  interfaceId: z.string().min(1),
  /*
   * ACCEPTED, NO LONGER OBEYED (audit E16) — same rule as the write path.
   *
   * This route's whole purpose is to answer "what would the deployed application
   * see?", and the deployed application cannot choose a dataset: the read path
   * takes `Interface.entitySet` and nothing else. A console that could override it
   * would answer a question nobody asked and, worse, would report a green run for
   * a dataset the real call never touches.
   *
   * Kept in the schema so that sending a DIFFERENT one is refused out loud rather
   * than silently discarded; the Test Console's saved cases replay the value they
   * recorded, and a case recorded before the feed's set changed should say so.
   */
  entity: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  /**
   * WHICH credential to run as. A solution holds one runtime credential per
   * environment (AD-11), and the run binds by the credential's environment —
   * so with several live, "the first row" would be a system nobody chose. The
   * console always names one; the fallback below serves a solution with
   * exactly one.
   */
  clientId: z.string().min(1).optional(),
  /**
   * The query string the deployed application would send (P1.4): select,
   * filter.<Field>.<op>, orderby, key.<Field>, count and pageSize, as on
   * /data. Absent or empty: the ?limit run, exactly as before.
   */
  query: z.string().max(4096).optional(),
});

/** The most rows a console query run shows: one page, read by a person. */
const CONSOLE_MAX_PAGE = 50;

/** Said after every refusal the deployed application would receive too. */
const SAME_AS_APP = " (This is the refusal the deployed application would receive.)";

/** The console renders refusals as outcomes, so they travel in the data; a query refusal's `error.query` with them. */
function refusalOk(kind: string, message: string, query?: QueryRefusalDetail) {
  return studioOk({ outcome: "refused" as const, refusal: query === undefined ? { kind, message } : { kind, message, query } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) {
    return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  }
  if (lacksStudioTenantScope(user)) return studioError("FORBIDDEN", "No organization scope.");
  const scoped = tenantScopeFor(user);
  if (!scoped.ok) return studioError("FORBIDDEN", "No organization scope.");
  const scope = scoped.scope;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return studioError("VALIDATION_ERROR", "Invalid run request.");
  const input = parsed.data;
  const correlationId = newCorrelationId();
  // The query the app would send, parsed as the data route parses its own
  // (pure, no statement). A string with no query parameter in it is not a
  // query run; it is refused here, before anything is spent or audited.
  const queryText = (input.query ?? "").trim().replace(/^\?/, "");
  const query = queryText === "" ? null : parseQueryParams(new URLSearchParams(queryText), queryText.length + 1);
  if (query !== null && !query.surface) {
    return studioError(
      "VALIDATION_ERROR",
      "This query carries no query parameter (select, filter.<Field>.<op>, orderby, key.<Field>, count or pageSize). Leave it empty for a ?limit run.",
    );
  }

  const iface = await prisma.interface.findFirst({
    where: scopedById(scope, input.interfaceId),
    select: {
      id: true,
      name: true,
      solutionId: true,
      externalId: true,
      sapProduct: true,
      entitySet: true,
      servicePath: true,
      odataVersion: true,
    },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  /*
   * 0 — the solution-level gate authenticateClientToken applies before anything
   * else about the call is considered. This route resolves a credential ROW
   * rather than a bearer token, so it never passed through that function, and a
   * RETIRED solution's console run went on working after every deployed call
   * against it had started failing. Same check, same function, stated first.
   */
  const runtime = await checkSolutionRuntime(scope.organizationId, iface.solutionId);
  if (!runtime.ok) {
    return refusalOk(
      runtime.reason,
      runtime.reason === "SOLUTION_RETIRED"
        ? "This solution is RETIRED, so every call its deployed application makes is refused — this one included. Reactivate the solution to run against it."
        : "The solution that owns this interface no longer exists. (This is the refusal the deployed application would receive.)",
    );
  }

  // The solution's runtime credential row — the identity the deployed app
  // holds. No credential means the app's first call would 401; say exactly that.
  const now = new Date();
  const liveClients = (
    await prisma.solutionClient.findMany({
      where: scopedWhere(scope, {
        solutionId: iface.solutionId,
        isActive: true,
        revokedAt: null,
        ...(input.clientId ? { id: input.clientId } : {}),
      }),
      // lastUsedAt: the stamp below is written at most once a minute (P0.19).
      select: { id: true, environment: true, sapClient: true, expiresAt: true, lastUsedAt: true },
      orderBy: { createdAt: "asc" },
    })
  ).filter((c) => c.expiresAt === null || c.expiresAt.getTime() > now.getTime());
  if (liveClients.length === 0) {
    return refusalOk(
      "NO_CREDENTIAL",
      input.clientId
        ? "That credential is no longer live (revoked, expired or not this solution's). Pick another, or issue one under API Access."
        : "This solution has no live runtime credential, so its deployed application cannot call anything. Issue one under API Access — this console runs with the same identity.",
    );
  }
  if (liveClients.length > 1) {
    return refusalOk(
      "AMBIGUOUS_CREDENTIAL",
      `This solution holds live credentials for ${liveClients.map((c) => c.environment).join(", ")}. Pick which one to run as — each binds to a different system.`,
    );
  }
  const client = liveClients[0]!;

  // A sandbox developer (P0.13) runs against SANDBOX credentials only, the same
  // ceiling every console read holds them to; refused before the bucket or SAP.
  if (isSandboxDeveloper(user.role) && parseSapEnvironment(client.environment) !== "SANDBOX") {
    return refusalOk(
      "SANDBOX_ONLY",
      consoleReadRefusalMessage("SANDBOX_ONLY", parseSapEnvironment(client.environment)),
    );
  }

  /*
   * THE SAME PER-CREDENTIAL BUCKET THE NORTHBOUND ROUTES USE (audit E18).
   *
   * This route runs the real read pipeline against a real tenant, so it is the
   * one console surface that amplifies onto a customer's SAP system exactly like
   * a deployed application — and it was covered only by middleware's IP-keyed
   * `sapLive` bucket. An IP key is the wrong shape here for the same two reasons
   * it is wrong on the data route: several consultants behind one office address
   * throttle each other, and the budget is not the one the credential being
   * exercised actually has.
   *
   * Keyed `northbound:` — the READ bucket, deliberately, not a third one. The
   * point of the dry run is that it spends what the real call would spend, so a
   * console session that would exhaust the application's budget exhausts it here
   * too and the builder finds out in Studio rather than in production.
   */
  const rate = await rateLimit(`northbound:${client.id}`, "Too many requests for this client credential.");

  /*
   * One dry-run row per run, about this interface and credential (pipeline.ts
   * GovernedAudit), written whether the run was refused or ran.
   */
  const audit = new GovernedAudit(
    {
      organizationId: scope.organizationId,
      solutionId: iface.solutionId,
      operation: "READ",
      environment: client.environment,
      correlationId,
      clientTokenId: client.id,
      dryRun: true,
    },
    { interfaceId: iface.id, externalId: iface.externalId },
  );

  if (!rate.ok) {
    // A limiter outage is not this credential's budget (audit A44): audited
    // 503 with its reason, and said as the outage it is.
    await audit.refused(rate.refusal);
    if (rate.refusal.reason === "LIMITER_UNAVAILABLE") return refusalOk("LIMITER_UNAVAILABLE", LIMITER_UNAVAILABLE_MESSAGE);
    return refusalOk(
      "RATE_LIMITED",
      `This credential has spent its budget of ${RATE_LIMITS.northbound.limit} calls a minute — the same budget the deployed application shares. ` +
        `Wait ${Math.ceil((rate.refusal.resetMs ?? 0) / 1000)}s and run again.`,
    );
  }

  /*
   * AND RECORD THE USE. `lastUsedAt` is how an unused credential is spotted and
   * retired, and how a leaked one shows activity. The deployed application's own
   * calls update it (`touchClientLastUsed`); a console run exercises the same
   * credential against the same tenant and left it untouched, so a credential
   * used daily from Studio looked dormant on the operations board. Fire-and-
   * forget, exactly as the northbound routes do it: failing to stamp a timestamp
   * must never fail the run. And at most once a minute per key, as they stamp
   * it (P0.19, auth.ts LAST_USED_STAMP_INTERVAL_MS): passed the row's own
   * value, so a run within a minute of the key's last use writes nothing.
   */
  void touchClientLastUsed(client.id, scope.organizationId, client.lastUsedAt);

  if (query !== null) {
    return consoleQueryRun({ scope, user, iface, client, audit, now, correlationId, entity: input.entity, query });
  }

  // 1 — the grant gate, exactly as the broker evaluates it.
  const access = await authorise("READ", scope, iface.solutionId, iface.id, client.environment, now);
  if (!access.ok) {
    await audit.refused(access.refusal);
    return refusalOk(
      access.refusal.reason,
      `${access.refusal.message} (This is the refusal the deployed application would receive.)`,
    );
  }
  const granted = access.value;

  // 2 — the connection binding, environment + SAP client, same as the broker.
  const bound = await bindConnection(
    scope.organizationId,
    iface.sapProduct,
    client.environment,
    "READ",
    client.sapClient,
    prefetchedConnectionsFor(granted),
  );
  if (!bound.ok) {
    await audit.refused(bound.refusal);
    return refusalOk(
      bound.refusal.reason,
      `${bound.refusal.message} (This is the refusal the deployed application would receive.)`,
    );
  }
  const { connection, bindingUnverified } = bound.value;

  // The same resolution the broker makes: the interface's own service, or the
  // catalogue's — never a fallback from one to the other (read-definition.ts).
  const entitySet = iface.entitySet;
  const target = await resolveReadTarget(bound.value.product, iface, connection, (reason) =>
    reason === "NO_ENTITY_SET"
      ? granted.draft
        ? "This feed is still a draft and names no dataset yet. Set its entity set in Studio — the deployed application reads that value and nothing else."
        : "This feed names no dataset. Set its entity set in Studio — the deployed application reads that value and nothing else."
      : reason === "SERVICE_PATH_INVALID"
        ? "This interface's own service path is not valid for its product. Fix it in Studio."
        : "The catalogue service for this interface could not be resolved.",
  );
  if (input.entity !== undefined && input.entity !== entitySet) {
    const mismatch = refusal(
      "resolveInterface",
      "ENTITY_NOT_YOURS_TO_CHOOSE",
      `This run asked for "${input.entity}", but this feed serves ${entitySet ? `"${entitySet}"` : "no dataset yet"}. ` +
        "The dataset is part of the feed's definition — the deployed application cannot choose one either, " +
        "so a run against a different dataset would not tell you anything about the real call. " +
        "Change the feed's dataset in Studio, or re-record this case.",
      { audit: { connection } },
    );
    await audit.refused(mismatch);
    return refusalOk(mismatch.reason, mismatch.message);
  }
  if (!target.ok) {
    await audit.refused(target.refusal);
    // One kind for all three: the console has always shown them as "no dataset to run".
    return refusalOk("NO_ENTITY_SET", target.refusal.message);
  }
  const { service } = target.value;

  // 3 — contain: the same circuit the deployed application's call meets.
  const circuit = await contain(bound.value, correlationId);
  if (!circuit.ok) {
    await audit.refused(circuit.refusal);
    return refusalOk(
      circuit.refusal.reason,
      `${circuit.refusal.message} (This is the refusal the deployed application would receive.)`,
    );
  }

  // 4 — the same read function the broker calls, against the BOUND connection.
  const { result } = await callSapRead(
    bound.value,
    { servicePath: service.path, entitySet: target.value.entitySet, limit: input.limit ?? 10 },
    circuit.value,
  );
  const durationMs = result.durationMs;
  // The broker's own mapping — one fact, one function.
  const httpStatus = httpStatusFor(result.status);

  await audit.record(httpStatus, {
    rowCount: result.records.length,
    connection,
    durationMs,
    /*
     * THE CAUSE, ON THE ROW THE QUOTED ID LEADS TO (A56). The console shows a
     * correlation id for ops to look up; this row used to record a bare 502
     * with no reason, so a run that failed on a rotated client secret could not
     * be told apart from a SAP fault — while the same failure through the
     * deployed app recorded its code. The data route's own field and log line.
     */
    failureReason: result.failureReason,
  });
  // A passing run is the app's first governed call in this environment as
  // much as the deployed app's would be (P2.12): same pipeline, same key.
  await noteFirstCall({
    organizationId: scope.organizationId,
    solutionId: iface.solutionId,
    environment: connection.environment ?? client.environment,
    channel: "test-console",
    status: httpStatus,
    actorUserId: user.id,
  });
  if (result.failureReason) {
    console.warn("[studio] broker-run read failed", {
      correlationId,
      failureReason: result.failureReason,
      httpStatus: result.httpStatus,
      durationMs,
    });
  }

  return studioOk({
    outcome: "ran" as const,
    status: result.status,
    httpStatus,
    records: result.records,
    count: result.records.length,
    empty: result.status === "EMPTY",
    note: result.detail,
    durationMs,
    draft: granted.draft,
    /*
     * THE CONTRACT THIS RUN WAS AGAINST (P0.4, A38). The console sends it back
     * with Capture schema and Capture fixture, and the capture is refused when
     * the interface has moved on since — a run of the old entity set must not
     * be recorded as the new contract's shape or mock.
     */
    contract: { version: granted.version, entitySet: granted.entitySet },
    // WHICH system answered — the fact the old console could not state. The
    // caller's own connection metadata, never another org's.
    boundTo: {
      key: connection.key,
      label: connection.label,
      environment: connection.environment,
      sapClient: connection.client,
      bindingUnverified,
    },
    correlationId,
  });
}

/* ── the query run (P1.4) ─────────────────────────────────────────────── */

interface QueryRunContext {
  readonly scope: TenantScope;
  readonly user: { readonly id: string };
  readonly iface: { readonly id: string; readonly solutionId: string; readonly sapProduct: string };
  readonly client: { readonly id: string; readonly environment: string; readonly sapClient: string | null };
  readonly audit: GovernedAudit;
  readonly now: Date;
  readonly correlationId: string;
  readonly entity: string | undefined;
  readonly query: Extract<ParsedQuery, { surface: true }>;
}

/**
 * The query surface's read, as the data route runs it (data/route.ts
 * queryRead), for page 0 only and at most CONSOLE_MAX_PAGE rows. Every
 * refusal is audited once, dry-run, with the query's columns, and shown with
 * its `error.query`.
 */
async function consoleQueryRun(c: QueryRunContext): Promise<NextResponse> {
  const { scope, iface, client, audit, now, correlationId, query } = c;
  const refuse = async (step: PipelineStep, r: QueryRefusal, extra: RefusalAudit = {}) => {
    const refused = queryRefusalOf(step, r, extra);
    await audit.refused(refused);
    return refusalOk(refused.reason, `${refused.message}${SAME_AS_APP}`, r.detail);
  };

  if (!query.ok) {
    return refuse("resolveInterface", queryRefusal("QUERY_INVALID", query.rule, query.message, query.parameter === undefined ? {} : { parameter: query.parameter }));
  }
  if (query.cursor !== null) {
    return refuse(
      "resolveInterface",
      queryRefusal("QUERY_INVALID", "PARAMETER_CONFLICT", "The Test Console runs the first page only; send the query without cursor.", { parameter: "cursor" }),
    );
  }
  // The switch, then the ring, as on the data route: off refuses, never ignores.
  const gate = querySurfaceGate();
  if (!gate.ok) return refuse("resolveInterface", gate);
  const ring = gate.ring;

  // 1 — the grant gate, with the compiled policy in the same statement.
  const access = await authorise("READ", scope, iface.solutionId, iface.id, client.environment, now, { withQueryPolicy: true });
  if (!access.ok) {
    await audit.refused(access.refusal);
    return refusalOk(access.refusal.reason, `${access.refusal.message}${SAME_AS_APP}`);
  }
  const granted = access.value;
  const context = queryContextFor(granted);
  if (!context) throw new QueryCompilerInvariantError("A console query run authorised without its query context.");

  // The policy, then the query against it: after the grant, as on the data route.
  const available = checkPolicyAvailable(context.policyRaw, { entitySet: granted.entitySet, sourcePresent: context.policySourcePresent });
  if (!available.ok) return refuse("authorise", available);
  const { policy } = available;
  if (query.kind === "LIST" && query.pageSize !== null && query.pageSize > CONSOLE_MAX_PAGE) {
    return refuse(
      "authorise",
      queryRefusal("QUERY_INVALID", "PAGE_SIZE_NOT_ALLOWED", `The Test Console shows at most ${CONSOLE_MAX_PAGE} records; send pageSize=${CONSOLE_MAX_PAGE} or less.`, { parameter: "pageSize" }),
    );
  }
  // A list without pageSize shows the policy's default page, within the console's.
  const asked = query.kind === "LIST" ? { ...query, pageSize: query.pageSize ?? Math.min(policy.compiled.page.defaultSize, CONSOLE_MAX_PAGE) } : query;
  const checked = checkQuery(asked, policy);
  if (!checked.ok) return refuse("authorise", checked);
  const { ast, project } = checked;
  const base: QueryAuditFields = {
    kind: ast.kind === "KEY" ? "KEY" : "LIST",
    shape: queryShape(ast),
    requestedFields: ast.select === null ? ["*"] : [...project],
    policyRev: policy.compiled.rev,
  };

  // 2 — the connection binding, environment + SAP client, same as the broker.
  const bound = await bindConnection(scope.organizationId, iface.sapProduct, client.environment, "READ", client.sapClient, prefetchedConnectionsFor(granted));
  if (!bound.ok) {
    await audit.refused({ ...bound.refusal, audit: { ...bound.refusal.audit, query: base } });
    return refusalOk(bound.refusal.reason, `${bound.refusal.message}${SAME_AS_APP}`);
  }
  const { connection, bindingUnverified } = bound.value;

  const target = await resolveReadTarget(bound.value.product, granted, connection, (reason) =>
    reason === "NO_ENTITY_SET"
      ? "This feed names no dataset. Set its entity set in Studio — the deployed application reads that value and nothing else."
      : reason === "SERVICE_PATH_INVALID"
        ? "This interface's own service path is not valid for its product. Fix it in Studio."
        : "The catalogue service for this interface could not be resolved.",
  );
  if (c.entity !== undefined && c.entity !== granted.entitySet) {
    const mismatch = refusal(
      "resolveInterface",
      "ENTITY_NOT_YOURS_TO_CHOOSE",
      `This run asked for "${c.entity}", but this feed serves ${granted.entitySet ? `"${granted.entitySet}"` : "no dataset yet"}. ` +
        "The dataset is part of the feed's definition — the deployed application cannot choose one either. Re-record this case.",
      { audit: { connection, query: base } },
    );
    await audit.refused(mismatch);
    return refusalOk(mismatch.reason, mismatch.message);
  }
  if (!target.ok) {
    await audit.refused(target.refusal);
    return refusalOk("NO_ENTITY_SET", target.refusal.message);
  }
  const { service, entitySet } = target.value;
  if (entitySet !== policy.compiled.entitySet) {
    return refuse(
      "authorise",
      queryRefusal("QUERY_NOT_AVAILABLE", "POLICY_STALE", "This interface's query policy no longer matches its contract; its builder must review it in Studio."),
      { connection, query: base },
    );
  }

  // The OData query, from the checked AST only, measured as fetch sends it.
  // A broken invariant is CoreEdge's defect, never the run's: nothing is sent
  // to SAP, and the row says 500, as the data route's does.
  const defect = async (err: unknown, sentToSap: boolean) => {
    if (!(err instanceof QueryCompilerInvariantError)) throw err;
    console.error("[studio] broker-run query defect", { correlationId, error: err.message });
    await audit.record(500, { connection, query: base });
    return studioError(
      "INTERNAL",
      sentToSap ? "CoreEdge could not assemble SAP's answer. No rows were shown." : "CoreEdge could not build this query. Nothing was sent to SAP.",
      correlationId,
    );
  };
  let plan: ReturnType<typeof planPage> | null;
  let built: ReturnType<typeof buildQueryUrl>;
  try {
    plan = ast.kind === "LIST" ? planPage(policy, ast, null) : null;
    built = buildQueryUrl(
      compileQuery(ast, policy, plan === null ? { skip: 0, top: null, page0: true } : { skip: plan.skip, top: plan.ask, page0: true }, project),
      { baseUrl: connection.baseUrl, servicePath: service.path, entitySet, client: connection.client },
    );
  } catch (err) {
    return defect(err, false);
  }
  if (!built.ok) return refuse("resolveInterface", built, { connection, query: base });
  const sent = { kind: built.query.kind as SapQueryKind, sent: sentLine(built.query, { servicePath: service.path, entitySet }) };

  // 3 — contain: the same circuit the deployed application's call meets.
  const circuit = await contain(bound.value, correlationId);
  if (!circuit.ok) {
    await audit.refused({ ...circuit.refusal, audit: { ...circuit.refusal.audit, query: base } });
    return refusalOk(circuit.refusal.reason, `${circuit.refusal.message}${SAME_AS_APP}`);
  }

  // 4 — the same query read the broker makes, against the BOUND connection.
  const countAsked = plan !== null && ast.count;
  const { result, durationMs } = await callSapQuery(bound.value, { built: { url: built.url, query: built.query }, countAsked }, circuit.value);
  if (result.failureReason) {
    console.warn("[studio] broker-run query failed", { correlationId, failureReason: result.failureReason, httpStatus: result.httpStatus, durationMs });
  }
  const hash = queryHash(ast, { organizationId: scope.organizationId, interfaceId: iface.id }, ring);
  const sentFlags: readonly QueryFlag[] = built.query.flags;

  /** One dry-run row, the status the app would get, then the first-call note: the data route's order. */
  const ran = async (
    queryStatus: QueryReadStatus,
    status: number,
    extras: { rows: readonly Record<string, unknown>[]; rule: QueryRule | null; failureReason: string | null; flags: readonly QueryFlag[]; page?: PageInfo; chain?: { id: string; rows: number }; bytes?: number; totalCount?: number | null; note: string },
  ) => {
    await audit.record(status, {
      rowCount: extras.rows.length,
      durationMs,
      connection,
      failureReason: extras.failureReason,
      query: {
        ...base,
        hash,
        rule: extras.rule,
        flags: joinQueryFlags([...sentFlags, ...extras.flags]),
        ...(extras.chain ? { chainId: extras.chain.id, pageIndex: 0, chainRows: extras.chain.rows } : {}),
        ...(extras.bytes === undefined ? {} : { responseBytes: extras.bytes }),
      },
    });
    await noteFirstCall({
      organizationId: scope.organizationId,
      solutionId: iface.solutionId,
      environment: connection.environment ?? client.environment,
      channel: "test-console",
      status,
      actorUserId: c.user.id,
    });
    return studioOk({
      outcome: "ran" as const,
      // The query's own outcome; no `status`, so no capture is offered for it.
      queryStatus,
      httpStatus: status,
      records: extras.rows,
      count: extras.rows.length,
      empty: queryStatus === "EMPTY",
      note: extras.note,
      ...(extras.totalCount === undefined ? {} : { totalCount: extras.totalCount }),
      // What was sent, as the service path and options: never the host.
      query: { ...sent, page: extras.page ?? null, rule: extras.rule },
      durationMs,
      draft: granted.draft,
      contract: { version: granted.version, entitySet: granted.entitySet },
      boundTo: {
        key: connection.key,
        label: connection.label,
        environment: connection.environment,
        sapClient: connection.client,
        bindingUnverified,
      },
      correlationId,
    });
  };

  if (result.answer === null) {
    return ran(result.status, httpStatusForQuery(result.status), {
      rows: [],
      rule: queryRuleForStatus(result.status),
      failureReason: result.failureReason,
      flags: [],
      note: result.detail,
    });
  }

  if (plan !== null) {
    let page: ReturnType<typeof assemblePage>;
    try {
      page = assemblePage({
        policy,
        ast,
        plan,
        cursor: null,
        answer: result.answer,
        // Bound to this credential as the app's would be; no cursor is sealed with it.
        binding: { organizationId: scope.organizationId, clientId: client.id, interfaceId: iface.id, apiVersion: "console" },
        ring,
        now,
        interface: { id: granted.id, name: granted.name, version: granted.version },
        connection: { id: connection.id, revision: connection.revision ?? 0 },
        authorisingGrantIds: context.authorisingGrantIds,
        issueCursor: false,
      });
    } catch (err) {
      return defect(err, true);
    }
    if (!page.ok) {
      const answer = QUERY_OUTCOME_ANSWER[page.rule];
      return ran(page.rule === "ROW_TOO_LARGE" ? "TOO_LARGE" : "ERROR", answer.status, {
        rows: [],
        rule: page.rule,
        failureReason: answer.failureReason,
        flags: page.flags,
        note: answer.message,
      });
    }
    const data = (JSON.parse(page.body) as { data: { records: Record<string, unknown>[]; note: string; totalCount?: number | null } }).data;
    return ran(page.served === 0 ? "EMPTY" : "OK", 200, {
      rows: data.records,
      rule: null,
      failureReason: null,
      flags: page.flags,
      page: page.page,
      chain: { id: page.chainId, rows: page.chainRows },
      bytes: page.bytes,
      ...(data.totalCount === undefined ? {} : { totalCount: data.totalCount }),
      note: data.note,
    });
  }

  const key = assembleKey({
    policy,
    kind: built.query.kind === "KEY_VIA_FILTER" ? "KEY_VIA_FILTER" : "KEY",
    answer: result.answer,
    interface: { id: granted.id, name: granted.name, version: granted.version },
  });
  if (!key.ok) {
    if (key.outcome === "NO_RECORD") {
      return ran("NO_RECORD", 404, { rows: [], rule: null, failureReason: null, flags: key.flags, note: "SAP has no record with this key." });
    }
    const answer = QUERY_OUTCOME_ANSWER[key.outcome];
    return ran(key.outcome === "ROW_TOO_LARGE" ? "TOO_LARGE" : "ERROR", answer.status, {
      rows: [],
      rule: key.outcome,
      failureReason: answer.failureReason,
      flags: key.flags,
      note: answer.message,
    });
  }
  const record = (JSON.parse(key.body) as { data: { records: Record<string, unknown>[]; note: string } }).data;
  return ran("OK", 200, { rows: record.records, rule: null, failureReason: null, flags: key.flags, bytes: key.bytes, note: record.note });
}
