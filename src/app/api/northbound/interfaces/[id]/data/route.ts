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
 *             → read → honest status → audit
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
import { resolveReadableInterface } from "@/lib/northbound/access";
import { authenticateClientToken, extractBearer, touchClientLastUsed } from "@/lib/northbound/auth";
import { noteFailedCredential } from "@/lib/northbound/auth-failures";
import { resolveBindingFor } from "@/lib/northbound/binding";
import { recordNorthboundCall } from "@/lib/northbound/audit";
import { httpStatusFor, readEntitySet } from "@/lib/northbound/read";
import { northboundErrorCodeFor } from "@/lib/northbound/read-status";
import { resolveReadDefinition } from "@/lib/northbound/read-definition";
import {
  newCorrelationId,
  northboundError,
  northboundOk,
  northboundThrottleRefusal,
  unauthenticated,
} from "@/lib/northbound/respond";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { connectionRefusalMessage } from "@/lib/sap-public/connection-resolver";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = newCorrelationId();

  // 1 — authenticate. Every failure mode collapses to one 401 for the caller.
  const bearer = extractBearer(request.headers.get("authorization"));
  const auth = await authenticateClientToken(bearer);
  if (!auth.ok) {
    console.warn("[northbound] auth rejected", { reason: auth.reason, correlationId });
    // A key matching no row spends the address's failed-lookup budget, which
    // the edge reads first; a real key that refuses is bounded by its own.
    await noteFailedCredential(request.headers, bearer, auth.reason);
    return unauthenticated(correlationId);
  }
  const client = auth.client;
  void touchClientLastUsed(client.clientId, client.organizationId);

  // 1b — throttle THIS credential. Checked after auth so the key is the client,
  // not an address a dozen customers might share.
  const rate = await checkRateLimit(`northbound:${client.clientId}`, RATE_LIMITS.northbound);
  if (!rate.allowed) {
    // 429 for this credential's own use, 503 when the limiter is down (A44).
    const refusal = northboundThrottleRefusal(rate, correlationId, "Too many requests for this client credential.");
    await recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId: null,
      operation: "READ",
      externalId: "-",
      environment: client.environment,
      status: refusal.status,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
      failureReason: refusal.failureReason,
    });
    return refusal.response;
  }

  const { id } = await ctx.params;
  const limitParam = Number.parseInt(request.nextUrl.searchParams.get("limit") ?? "10", 10);
  const limit = Number.isFinite(limitParam) ? limitParam : 10;

  // 2 — authorize: the interface is this solution's, and a live grant covers it.
  const access = await resolveReadableInterface(
    client.scope,
    client.solutionId,
    id,
    client.environment,
  );
  if (!access.ok) {
    const status = access.reason === "INTERFACE_NOT_FOUND" || access.reason === "NOT_THIS_SOLUTION" ? 404 : 403;
    await recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId: id,
      operation: "READ",
      externalId: "-",
      environment: client.environment,
      status,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
    });
    return northboundError(
      status === 404 ? "NOT_FOUND" : "FORBIDDEN",
      access.message,
      status,
      correlationId,
    );
  }
  const iface = access.iface;

  // 3 — resolve the client's OWN SAP connection, BOUND TO THIS CREDENTIAL'S
  // ENVIRONMENT. Never the shared env tenant, and never simply the oldest row:
  // picking by creation order is how a sandbox credential reached production.
  // The lane board's own binding (P0.2): `bindingFor` on the product's
  // estate. An unknown product is its own reason, UNKNOWN_PRODUCT, not
  // NO_CONNECTION: an interface-config defect with a different fix, and
  // NO_CONNECTION is excluded from the incident rule — this must not be.
  const product = getSapProduct(iface.sapProduct);
  const binding = await resolveBindingFor(
    client.organizationId,
    iface.sapProduct,
    client.environment,
    "read",
    client.sapClient,
  );

  if (!binding.ok) {
    await recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId: iface.id,
      operation: "READ",
      externalId: iface.externalId,
      environment: client.environment,
      status: 403,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
      // The reason, so the incident engine can tell this apart from a
      // grant-gate 403 — they are otherwise identical in the trail.
      bindingRefusal: binding.reason,
    });
    return northboundError(
      "CONNECTION_NOT_CONFIGURED",
      connectionRefusalMessage(binding.reason, client.environment),
      403,
      correlationId,
    );
  }

  const connection = binding.connection;

  // `product!` is sound: a null product forces the binding to fail above, so we
  // cannot reach here without one. Same idiom as the write route.
  // The interface's OWN service when it carries one, the catalogue's otherwise —
  // never a fallback from one to the other (see interface-service.ts). The
  // same function decides discovery's `callable` (read-definition.ts, A42).
  const definition = await resolveReadDefinition(product!, iface);
  /*
   * THE GOVERNED ENTITY SET IS THE ONLY SOURCE (audit E16).
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
   * a configuration gap and is refused as one, below, rather than being papered
   * over with whatever the caller happened to ask for. The discovery console
   * (`/api/sap/tdd/preview`) is where a builder chooses a set; that is a
   * different surface, with its own environment ceiling and its own audit row.
   */
  if (!definition.ok) {
    await recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId: iface.id,
      operation: "READ",
      externalId: iface.externalId,
      environment: client.environment,
      status: 400,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
      connectionId: connection.id,
      connectionEnvironment: connection.environment,
    });
    return northboundError(
      "VALIDATION_ERROR",
      definition.reason === "NO_ENTITY_SET"
        ? iface.draft
          ? "This data feed is still a draft and names no dataset yet. Set its entity set in Studio and publish it — the dataset is part of the feed's definition, not something a caller may choose."
          : "This data feed names no dataset. Set its entity set in Studio — the dataset is part of the feed's definition, not something a caller may choose."
        : definition.reason === "SERVICE_PATH_INVALID"
          ? "This interface's own service path is not valid for its product. Fix it in Studio."
          : "The catalogue service for this interface could not be resolved.",
      400,
      correlationId,
    );
  }
  const { service, entitySet } = definition;

  // 4 — read, and report exactly what came back.
  //
  // Timed around the UPSTREAM call only. Measuring from the top of the handler
  // would fold our own auth, grant and binding work into a number the operations
  // console labels "how slow is this tenant", which would be a quietly wrong
  // answer to the question actually being asked.
  const startedAt = Date.now();
  const result = await readEntitySet({
    connection,
    servicePath: service.path,
    entitySet,
    limit,
  });
  const durationMs = Date.now() - startedAt;
  const status = httpStatusFor(result.status);

  await recordNorthboundCall({
    organizationId: client.organizationId,
    solutionId: client.solutionId,
    interfaceId: iface.id,
    operation: "READ",
    externalId: iface.externalId,
    environment: client.environment,
    status,
    rowCount: result.records.length,
    correlationId,
    clientTokenId: client.clientId,
    durationMs,
    connectionId: connection.id,
    // Null here on a served read is the honest record of a permitted-but-
    // unverified binding: the connection never declared its landscape.
    connectionEnvironment: connection.environment,
    failureReason: result.failureReason,
  });
  // The app's first successful call in this environment (P2.12). A set
  // lookup in memory on every call after this instance's first: no database
  // round trip is added to the broker's hot path.
  await noteFirstCall({
    organizationId: client.organizationId,
    solutionId: client.solutionId,
    environment: connection.environment ?? client.environment,
    channel: "broker",
    status,
  });

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
