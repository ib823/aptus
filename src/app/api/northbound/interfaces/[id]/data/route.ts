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
 * RATE LIMITED PER TOKEN, in this route rather than in middleware. Middleware
 * keys by IP, which is wrong here twice over: a deployed application calls from
 * a handful of server addresses, so an IP key would let one busy customer
 * throttle another, and would let a stolen token hide behind a shared address.
 * Keyed by the resolved client, a runaway or leaked credential throttles only
 * itself — and the audit says exactly which one. Middleware's generic apiRead
 * ceiling still stands behind it as an unauthenticated-flood backstop.
 */

import type { NextRequest } from "next/server";

import { resolveReadableInterface } from "@/lib/northbound/access";
import { authenticateClientToken, extractBearer, touchClientLastUsed } from "@/lib/northbound/auth";
import { recordNorthboundCall } from "@/lib/northbound/audit";
import { httpStatusFor, readEntitySet } from "@/lib/northbound/read";
import {
  newCorrelationId,
  northboundError,
  northboundOk,
  unauthenticated,
} from "@/lib/northbound/respond";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  connectionRefusalMessage,
  resolveSapConnectionForEnvironment,
} from "@/lib/sap-public/connection-resolver";
import { resolveHubService } from "@/lib/sap-public/resolve-hub-service";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = newCorrelationId();

  // 1 — authenticate. Every failure mode collapses to one 401 for the caller.
  const auth = await authenticateClientToken(extractBearer(request.headers.get("authorization")));
  if (!auth.ok) {
    console.warn("[northbound] auth rejected", { reason: auth.reason, correlationId });
    return unauthenticated(correlationId);
  }
  const client = auth.client;
  void touchClientLastUsed(client.clientId, client.organizationId);

  // 1b — throttle THIS credential. Checked after auth so the key is the client,
  // not an address a dozen customers might share.
  const rate = await checkRateLimit(`northbound:${client.clientId}`, RATE_LIMITS.northbound);
  if (!rate.allowed) {
    const retryAfter = Math.ceil(rate.resetMs / 1000);
    await recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId: null,
      operation: "READ",
      externalId: "-",
      environment: client.environment,
      status: 429,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
    });
    return northboundError(
      "RATE_LIMITED",
      "Too many requests for this client credential.",
      429,
      correlationId,
      { "retry-after": String(retryAfter) },
    );
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
  const product = getSapProduct(iface.sapProduct);
  const binding = product
    ? await resolveSapConnectionForEnvironment(
        client.organizationId,
        iface.sapProduct,
        client.environment,
        "READ",
      )
    : ({ ok: false, reason: "NO_CONNECTION" } as const);

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
  const service = await resolveHubService(product!, iface.externalId);
  const entitySet = iface.entitySet ?? request.nextUrl.searchParams.get("entity");
  if (!service || !entitySet) {
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
      service
        ? "This interface has no entity set configured. Set one in Studio, or pass ?entity=."
        : "The catalogue service for this interface could not be resolved.",
      400,
      correlationId,
    );
  }

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
  });

  if (status >= 400) {
    const code =
      result.status === "NEEDS_SETUP"
        ? "FORBIDDEN"
        : result.status === "NOT_FOUND"
          ? "NOT_FOUND"
          : result.status === "TIMEOUT"
            ? "UPSTREAM_TIMEOUT"
            : "UPSTREAM_ERROR";
    return northboundError(code, result.detail, status, correlationId);
  }

  // 200 for OK *and* EMPTY. An empty resource is a successful read, and the
  // consumer is told so explicitly rather than left to infer it from a count.
  return northboundOk(
    {
      records: result.records,
      count: result.records.length,
      interface: { id: iface.id, name: iface.name, version: iface.version },
      empty: result.status === "EMPTY",
      note: result.detail,
    },
    correlationId,
  );
}
