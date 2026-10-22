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

import type { NextRequest } from "next/server";

import { noteFirstCall } from "@/lib/coreedge/journey";
import { afterResponse } from "@/lib/governed/after-response";
import {
  authenticate,
  authorise,
  bindConnection,
  callSapRead,
  contain,
  GovernedAudit,
  northboundRefusalResponse,
  prefetchedConnectionsFor,
  rateLimit,
  resolveReadTarget,
  type Refusal,
} from "@/lib/governed/pipeline";
import { httpStatusFor } from "@/lib/northbound/read";
import { northboundErrorCodeFor } from "@/lib/northbound/read-status";
import { newCorrelationId, northboundError, northboundOk } from "@/lib/northbound/respond";
import { withNorthboundVersion } from "@/lib/northbound/versioned-route";

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
  const refuse = async (r: Refusal) => {
    await audit.refused(r);
    return northboundRefusalResponse(r, correlationId);
  };

  // 1b — throttle THIS credential. Checked after auth so the key is the client,
  // not an address a dozen customers might share. 429 for this credential's
  // own use, 503 when the limiter is down (A44).
  const rate = await rateLimit(`northbound:${client.clientId}`, "Too many requests for this client credential.");
  if (!rate.ok) return refuse(rate.refusal);

  const { id } = await ctx.params;
  const limitParam = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10);
  const limit = Number.isFinite(limitParam) ? limitParam : 10;
  audit.about(id, "-");

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
  const target = await resolveReadTarget(bound.value.product, iface, connection, (reason) =>
    reason === "NO_ENTITY_SET"
      ? iface.draft
        ? "This data feed is still a draft and names no dataset yet. Set its entity set in Studio and publish it — the dataset is part of the feed's definition, not something a caller may choose."
        : "This data feed names no dataset. Set its entity set in Studio — the dataset is part of the feed's definition, not something a caller may choose."
      : reason === "SERVICE_PATH_INVALID"
        ? "This interface's own service path is not valid for its product. Fix it in Studio."
        : "The catalogue service for this interface could not be resolved.",
  );
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
  const status = httpStatusFor(result.status);

  await audit.record(status, {
    rowCount: result.records.length,
    durationMs,
    // Null connectionEnvironment on a served read is the honest record of a
    // permitted-but-unverified binding: the connection never declared its
    // landscape.
    connection,
    failureReason: result.failureReason,
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

  // 200 for OK *and* EMPTY. An empty resource is a successful read, and the
  // consumer is told so explicitly rather than left to infer it from a count.
  const response = northboundOk(
    {
      records: result.records,
      count: result.records.length,
      interface: { id: iface.id, name: iface.name, version: iface.version },
      empty: result.status === "EMPTY",
      note: result.detail,
    },
    correlationId,
  );
  // A draft interface is SERVED (premature is not wrong) and SAID: the status
  // used to be ignored entirely, so a consumer could build against a contract
  // its builder had not finished. Header rather than body so existing parsers
  // are untouched.
  if (iface.draft) response.headers.set("x-coreedge-interface-status", "DRAFT");
  return response;
}
