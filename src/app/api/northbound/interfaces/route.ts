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
import { recordNorthboundCall } from "@/lib/northbound/audit";
import { newCorrelationId, northboundError, northboundOk, unauthenticated } from "@/lib/northbound/respond";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
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

  /*
   * PER-CREDENTIAL THROTTLE AND AN AUDIT ROW — the two things the data routes
   * had and this one lacked. Discovery makes no SAP call, but it is a machine
   * caller enumerating a solution's whole interface inventory: keyed by
   * credential like every other northbound bucket (the IP-keyed edge bucket is
   * the wrong shape for servers — see the data route), and recorded, because a
   * stolen token mapping the surface used to leave NO trace at all while the
   * manual claimed the traffic screen showed "every northbound call".
   */
  const rate = await checkRateLimit(`northbound:${client.clientId}`, RATE_LIMITS.northbound);
  if (!rate.allowed) {
    await recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId: null,
      operation: "READ",
      externalId: "-discovery-",
      environment: client.environment,
      status: 429,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
    });
    return northboundError("RATE_LIMITED", "Too many requests. Slow down and retry.", 429, correlationId);
  }

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
      select: { externalId: true, operation: true, decision: true, expiresAt: true, revokedAt: true },
    }),
  ]);

  const now = Date.now();
  // THE SAME PREDICATE THE DATA ROUTE ENFORCES WITH — deliberately, and this
  // has been wrong TWICE.
  //
  // First with `isGranting`, which asks only "is this decision one of the
  // granting kinds?" and is display-only for exactly that reason. The read path
  // uses `grantsRead(decision, environment)`. They disagree on SANDBOX_ONLY
  // outside SANDBOX: `isGranting` says yes, `grantsRead` says no. So this
  // endpoint reported `callable: true` for a call that `access.ts` then refused
  // with 403 NO_APPROVED_GRANT — while the comment below promises the opposite.
  //
  // Then with revocation: `access.ts` refuses a revoked grant with
  // GRANT_REVOKED, and this filter never selected `revokedAt` — so a grant an
  // admin had withdrawn in Control Tower was advertised as callable right up to
  // the 403. The agreement test existed and its fixture never set `revokedAt`,
  // which is how the disagreement stayed green. An advisory that contradicts
  // the enforcement is worse than no advisory.
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
          // `== null` to match access.ts exactly — an unselected field must not
          // read as revoked. Same predicate, same nullishness, or they drift.
          g.revokedAt == null &&
          (g.expiresAt === null || g.expiresAt.getTime() > now),
      )
      .map((g) => `${g.externalId}::${g.operation}`),
  );

  // Discovery is audited like the data routes: a 200 with the interface count.
  await recordNorthboundCall({
    organizationId: client.organizationId,
    solutionId: client.solutionId,
    interfaceId: null,
    operation: "READ",
    externalId: "-discovery-",
    environment: client.environment,
    status: 200,
    rowCount: interfaces.length,
    correlationId,
    clientTokenId: client.clientId,
  });

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
        // DEPRECATED is refused by the read path (INTERFACE_DEPRECATED), so it
        // must not be advertised — same agreement rule as the grant predicates.
        // DRAFT stays callable; the data route flags it in a header.
        callable:
          i.mode !== "WRITE" &&
          i.status !== "DEPRECATED" &&
          liveGrants.has(`${i.externalId}::${i.operation}`),
      })),
    },
    correlationId,
  );
}
