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
 */

import type { NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { resolveReadableInterface } from "@/lib/northbound/access";
import { recordNorthboundCall } from "@/lib/northbound/audit";
import { httpStatusFor, readEntitySet } from "@/lib/northbound/read";
import { newCorrelationId } from "@/lib/northbound/respond";
import {
  connectionRefusalMessage,
  resolveSapConnectionForEnvironment,
} from "@/lib/sap-public/connection-resolver";
import { resolveHubService } from "@/lib/sap-public/resolve-hub-service";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import { studioError, studioOk } from "@/lib/studio/api";
import { canAccessStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";
import { scopedById, scopedWhere, tenantScopeFor } from "@/lib/studio/tenant-scope";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  interfaceId: z.string().min(1),
  entity: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

/** The console renders refusals as outcomes, so they travel in the data. */
function refusalOk(kind: string, message: string) {
  return studioOk({ outcome: "refused" as const, refusal: { kind, message } });
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

  const iface = await prisma.interface.findFirst({
    where: scopedById(scope, input.interfaceId),
    select: { id: true, name: true, solutionId: true, externalId: true, sapProduct: true, entitySet: true },
  });
  if (!iface) return studioError("NOT_FOUND", "Interface not found.");

  // The solution's runtime credential row — the identity the deployed app
  // holds. No credential means the app's first call would 401; say exactly that.
  const now = new Date();
  const client = await prisma.solutionClient.findFirst({
    where: scopedWhere(scope, { solutionId: iface.solutionId, isActive: true, revokedAt: null }),
    select: { id: true, environment: true, sapClient: true, expiresAt: true },
  });
  if (!client || (client.expiresAt !== null && client.expiresAt.getTime() <= now.getTime())) {
    return refusalOk(
      "NO_CREDENTIAL",
      "This solution has no live runtime credential, so its deployed application cannot call anything. Issue one under API Access — this console runs with the same identity.",
    );
  }

  const audit = (
    status: number,
    rowCount: number | null,
    extras: { connectionId?: string | null; connectionEnvironment?: string | null; durationMs?: number | null; bindingRefusal?: string | null } = {},
  ) =>
    recordNorthboundCall({
      organizationId: scope.organizationId,
      solutionId: iface.solutionId,
      interfaceId: iface.id,
      operation: "READ",
      externalId: iface.externalId,
      environment: client.environment,
      status,
      rowCount,
      correlationId,
      clientTokenId: client.id,
      dryRun: true,
      ...extras,
    });

  // 1 — the grant gate, exactly as the broker evaluates it.
  const access = await resolveReadableInterface(
    scope,
    iface.solutionId,
    iface.id,
    client.environment,
    now,
  );
  if (!access.ok) {
    await audit(403, null);
    return refusalOk(
      access.reason,
      `${access.message} (This is the refusal the deployed application would receive.)`,
    );
  }

  // 2 — the connection binding, environment + SAP client, same as the broker.
  const product = getSapProduct(iface.sapProduct);
  const binding = product
    ? await resolveSapConnectionForEnvironment(
        scope.organizationId,
        iface.sapProduct,
        client.environment,
        "READ",
        client.sapClient,
      )
    : ({ ok: false, reason: "UNKNOWN_PRODUCT" } as const);
  if (!binding.ok) {
    await audit(403, null, { bindingRefusal: binding.reason });
    return refusalOk(
      binding.reason,
      `${connectionRefusalMessage(binding.reason, client.environment)} (This is the refusal the deployed application would receive.)`,
    );
  }
  const connection = binding.connection;

  const service = await resolveHubService(product!, iface.externalId);
  const entitySet = input.entity ?? iface.entitySet;
  if (!service || !entitySet) {
    await audit(400, null, { connectionId: connection.id, connectionEnvironment: connection.environment });
    return refusalOk(
      "NO_ENTITY_SET",
      service
        ? "This interface has no entity set configured. Set one on the interface, or pass one here."
        : "The catalogue service for this interface could not be resolved.",
    );
  }

  // 3 — the same read function the broker calls, against the BOUND connection.
  const result = await readEntitySet({
    connection,
    servicePath: service.path,
    entitySet,
    limit: input.limit ?? 10,
  });
  const durationMs = result.durationMs;
  // The broker's own mapping — one fact, one function.
  const httpStatus = httpStatusFor(result.status);

  await audit(httpStatus, result.records.length, {
    connectionId: connection.id,
    connectionEnvironment: connection.environment,
    durationMs,
  });

  return studioOk({
    outcome: "ran" as const,
    status: result.status,
    httpStatus,
    records: result.records,
    count: result.records.length,
    empty: result.status === "EMPTY",
    note: result.detail,
    durationMs,
    draft: access.iface.draft,
    // WHICH system answered — the fact the old console could not state. The
    // caller's own connection metadata, never another org's.
    boundTo: {
      key: connection.key,
      label: connection.label,
      environment: connection.environment,
      sapClient: connection.client,
      bindingUnverified: binding.bindingUnverified,
    },
    correlationId,
  });
}
