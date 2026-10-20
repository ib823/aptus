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

import { GRANT_SELECT, READABLE_INTERFACE_SELECT } from "@/lib/northbound/access";
import { authenticateClientToken, extractBearer, touchClientLastUsed } from "@/lib/northbound/auth";
import { noteFailedCredential } from "@/lib/northbound/auth-failures";
import { recordNorthboundCall } from "@/lib/northbound/audit";
import { readVerdicts } from "@/lib/northbound/read-verdict";
import {
  newCorrelationId,
  northboundOk,
  northboundThrottleRefusal,
  unauthenticated,
} from "@/lib/northbound/respond";
import { prisma } from "@/lib/db/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { scopedWhere } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const correlationId = newCorrelationId();

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
    // 429 for this credential's own use, 503 when the limiter is down (A44).
    const refusal = northboundThrottleRefusal(rate, correlationId, "Too many requests. Slow down and retry.");
    await recordNorthboundCall({
      organizationId: client.organizationId,
      solutionId: client.solutionId,
      interfaceId: null,
      operation: "READ",
      externalId: "-discovery-",
      environment: client.environment,
      status: refusal.status,
      rowCount: null,
      correlationId,
      clientTokenId: client.clientId,
      failureReason: refusal.failureReason,
    });
    return refusal.response;
  }

  const [interfaces, grants] = await Promise.all([
    prisma.interface.findMany({
      where: scopedWhere(client.scope, { solutionId: client.solutionId }),
      // Exactly what the read decision judges, so the verdict below is the
      // data route's own (read-verdict.ts).
      select: READABLE_INTERFACE_SELECT,
      orderBy: { name: "asc" },
    }),
    prisma.apiAccessGrant.findMany({
      where: scopedWhere(client.scope, {
        solutionId: client.solutionId,
        environment: client.environment,
      }),
      // The read decision's own fields, plus the service id it is matched on.
      select: { ...GRANT_SELECT, externalId: true },
    }),
  ]);

  /*
   * THE DATA ROUTE'S CHAIN, NOT A COPY OF IT (P0.4, A42). This endpoint kept
   * its own predicate, and it drifted from the enforcement four times:
   * SANDBOX_ONLY outside SANDBOX (`isGranting` where the read path asks
   * `grantsRead`), revoked grants (`revokedAt` was never selected), grant
   * binding (P0.1), and then the feeds the data route refuses before a grant
   * matters at all — no entity set, an unresolvable catalogue service, no
   * connection the credential binds to. Each time, the comment here promised
   * agreement. The verdict is now the data route's own steps, in its order,
   * through the same functions; read-verdict.ts says what it can and cannot see.
   */
  const verdicts = await readVerdicts({
    organizationId: client.organizationId,
    solutionId: client.solutionId,
    environment: client.environment,
    sapClient: client.sapClient ?? null,
    interfaces,
    grants,
    now: new Date(),
  });

  /*
   * Discovery is audited like the data routes — a 200 — but with a NULL
   * rowCount, as the schema route does. `rowCount` means SAP records read, and
   * discovery reads none: it lists this solution's interfaces from CoreEdge's
   * own tables. Recording the interface count there put it in the usage
   * rollup's "Rows read", so an app that listed ten interfaces on every boot
   * was billed ten phantom SAP rows per boot.
   */
  await recordNorthboundCall({
    organizationId: client.organizationId,
    solutionId: client.solutionId,
    interfaceId: null,
    operation: "READ",
    externalId: "-discovery-",
    environment: client.environment,
    status: 200,
    rowCount: null,
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
        // refused before making it, instead of discovering it as a 403 or a
        // 400. True exactly when the data route would make the call; when it
        // would not, `refusal` names the reason it would record. A DRAFT is
        // callable once its definition is complete: the data route serves it
        // and flags it in a header.
        callable: verdicts.get(i.id) === null,
        refusal: verdicts.get(i.id) ?? null,
        // Which kind of service this is, and its version when the interface
        // declares one. Never the path or the host: the broker does not hand
        // out upstream addressing. (A custom interface's externalId is its
        // derived grant identity, `custom:<path>` — the path the developer
        // registered, never the connection's host.)
        service: {
          source: i.servicePath ? ("custom" as const) : ("catalogue" as const),
          odataVersion: i.odataVersion ?? null,
        },
      })),
    },
    correlationId,
  );
}
