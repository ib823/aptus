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
import { grantsRead, type GrantDecision, type GrantEnvironment } from "@/lib/studio/grants";
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
  // THE SAME PREDICATE THE DATA ROUTE ENFORCES WITH — deliberately, and this
  // has been wrong.
  //
  // This filter used `isGranting`, which asks only "is this decision one of the
  // granting kinds?" and is display-only for exactly that reason. The read path
  // uses `grantsRead(decision, environment)`. They disagree on SANDBOX_ONLY
  // outside SANDBOX: `isGranting` says yes, `grantsRead` says no. So this
  // endpoint reported `callable: true` for a call that `access.ts` then refused
  // with 403 NO_APPROVED_GRANT — while the comment below promises the opposite.
  // An advisory that contradicts the enforcement is worse than no advisory.
  //
  // `grantsRead` and not `grantsWrite`: write-mode interfaces are excluded from
  // `callable` outright a few lines down, so a read predicate is the whole of
  // what this set can ever decide. If that exclusion is ever relaxed, this must
  // branch on `isWriteOperation(g.operation)` at the same time.
  const environment = client.environment as GrantEnvironment;
  const liveGrants = new Set(
    grants
      .filter(
        (g) =>
          grantsRead(g.decision as GrantDecision, environment) &&
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
