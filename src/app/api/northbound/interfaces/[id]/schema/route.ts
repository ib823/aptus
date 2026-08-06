/**
 * GET /api/northbound/interfaces/[id]/schema — the contract, without a SAP call.
 *
 * Returns the interface's stored request/response schema so a client can
 * validate locally, generate types, or drive a mock. Deliberately makes NO live
 * call: fetching a contract should never cost a request against a customer's
 * production tenant, and should keep working when that tenant is down.
 *
 * Same authorization as the data read, minus the grant requirement: knowing the
 * SHAPE of an interface your own solution defined is not access to the client's
 * data. The grant governs reading records, which is what actually matters.
 */

import type { NextRequest } from "next/server";

import { authenticateClientToken, extractBearer, touchClientLastUsed } from "@/lib/northbound/auth";
import { recordNorthboundCall } from "@/lib/northbound/audit";
import {
  newCorrelationId,
  northboundError,
  northboundOk,
  unauthenticated,
} from "@/lib/northbound/respond";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { scopedById } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const correlationId = newCorrelationId();

  const auth = await authenticateClientToken(extractBearer(request.headers.get("authorization")));
  if (!auth.ok) {
    console.warn("[northbound] auth rejected", { reason: auth.reason, correlationId });
    return unauthenticated(correlationId);
  }
  const client = auth.client;
  void touchClientLastUsed(client.clientId, client.organizationId);

  const { id } = await ctx.params;

  // Per-credential throttle + audit, like discovery — see that route's comment.
  // A stolen token pulling every stored contract used to leave no trace.
  const rate = await checkRateLimit(`northbound:${client.clientId}`, RATE_LIMITS.northbound);
  if (!rate.allowed) {
    await recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId: id,
      operation: "READ",
      externalId: "-schema-",
      environment: client.environment,
      status: 429,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
    });
    return northboundError("RATE_LIMITED", "Too many requests. Slow down and retry.", 429, correlationId);
  }

  const iface = await prisma.interface.findFirst({
    where: scopedById(client.scope, id),
    select: {
      id: true,
      name: true,
      externalId: true,
      sapProduct: true,
      operation: true,
      entitySet: true,
      mode: true,
      version: true,
      requestSchema: true,
      responseSchema: true,
      solutionId: true,
    },
  });

  // "Not yours" and "does not exist" are the same answer, so a client cannot
  // probe for interfaces outside its own solution.
  if (!iface || iface.solutionId !== client.solutionId) {
    await recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId: id,
      operation: "READ",
      externalId: "-schema-",
      environment: client.environment,
      status: 404,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
    });
    return northboundError("NOT_FOUND", "No such interface.", 404, correlationId);
  }

  await recordNorthboundCall({
    organizationId: client.organizationId,
    solutionId: client.solutionId,
    interfaceId: iface.id,
    operation: "READ",
    externalId: "-schema-",
    environment: client.environment,
    status: 200,
    rowCount: null,
    correlationId,
    clientTokenId: client.clientId,
  });

  return northboundOk(
    {
      id: iface.id,
      name: iface.name,
      externalId: iface.externalId,
      sapProduct: iface.sapProduct,
      operation: iface.operation,
      entitySet: iface.entitySet,
      mode: iface.mode,
      version: iface.version,
      requestSchema: iface.requestSchema,
      responseSchema: iface.responseSchema,
      // Said out loud because a null schema is a real state, not a bug: it means
      // nobody has run this interface in the Test Console yet.
      schemaCaptured: iface.responseSchema !== null,
    },
    correlationId,
  );
}
