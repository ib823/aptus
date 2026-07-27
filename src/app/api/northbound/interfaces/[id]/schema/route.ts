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
import {
  newCorrelationId,
  northboundError,
  northboundOk,
  unauthenticated,
} from "@/lib/northbound/respond";
import { prisma } from "@/lib/db/prisma";
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
    return northboundError("NOT_FOUND", "No such interface.", 404, correlationId);
  }

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
