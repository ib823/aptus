/**
 * GET /api/northbound/interfaces — what may this client call?
 *
 * Metadata only; no SAP call is made. A developer's app (or their CI) can ask
 * what it is entitled to without touching the customer's tenant, which matters
 * because discovery should never cost a live request.
 *
 * Scoped to the token's own solution: a client cannot enumerate a sibling
 * solution's interfaces, even inside the same organization.
 */

import type { NextRequest } from "next/server";

import { authenticateClientToken, extractBearer, touchClientLastUsed } from "@/lib/northbound/auth";
import { newCorrelationId, northboundOk, unauthenticated } from "@/lib/northbound/respond";
import { prisma } from "@/lib/db/prisma";
import { isGranting, type GrantDecision } from "@/lib/studio/grants";
import { scopedWhere } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const correlationId = newCorrelationId();

  const auth = await authenticateClientToken(extractBearer(request.headers.get("authorization")));
  if (!auth.ok) {
    console.warn("[northbound] auth rejected", { reason: auth.reason, correlationId });
    return unauthenticated(correlationId);
  }
  const client = auth.client;
  void touchClientLastUsed(client.clientId, client.organizationId);

  const [interfaces, grants] = await Promise.all([
    prisma.interface.findMany({
      where: scopedWhere(client.scope, { solutionId: client.solutionId }),
      select: {
        id: true,
        name: true,
        externalId: true,
        sapProduct: true,
        operation: true,
        entitySet: true,
        mode: true,
        version: true,
        status: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.apiAccessGrant.findMany({
      where: scopedWhere(client.scope, {
        solutionId: client.solutionId,
        environment: client.environment,
      }),
      select: { externalId: true, operation: true, decision: true, expiresAt: true },
    }),
  ]);

  const now = Date.now();
  const liveGrants = new Set(
    grants
      .filter(
        (g) =>
          isGranting(g.decision as GrantDecision) &&
          (g.expiresAt === null || g.expiresAt.getTime() > now),
      )
      .map((g) => `${g.externalId}::${g.operation}`),
  );

  return northboundOk(
    {
      environment: client.environment,
      interfaces: interfaces.map((i) => ({
        id: i.id,
        name: i.name,
        externalId: i.externalId,
        sapProduct: i.sapProduct,
        operation: i.operation,
        entitySet: i.entitySet,
        mode: i.mode,
        version: i.version,
        status: i.status,
        // Stated per interface so a developer can see WHY a call would be
        // refused before making it, instead of discovering it as a 403.
        callable: i.mode !== "WRITE" && liveGrants.has(`${i.externalId}::${i.operation}`),
      })),
    },
    correlationId,
  );
}
