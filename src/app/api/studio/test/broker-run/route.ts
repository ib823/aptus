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
import { checkSolutionRuntime, touchClientLastUsed } from "@/lib/northbound/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
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
  /*
   * ACCEPTED, NO LONGER OBEYED (audit E16) — same rule as the write path.
   *
   * This route's whole purpose is to answer "what would the deployed application
   * see?", and the deployed application cannot choose a dataset: the read path
   * takes `Interface.entitySet` and nothing else. A console that could override it
   * would answer a question nobody asked and, worse, would report a green run for
   * a dataset the real call never touches.
   *
   * Kept in the schema so that sending a DIFFERENT one is refused out loud rather
   * than silently discarded; the Test Console's saved cases replay the value they
   * recorded, and a case recorded before the feed's set changed should say so.
   */
  entity: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  /**
   * WHICH credential to run as. A solution holds one runtime credential per
   * environment (AD-11), and the run binds by the credential's environment —
   * so with several live, "the first row" would be a system nobody chose. The
   * console always names one; the fallback below serves a solution with
   * exactly one.
   */
  clientId: z.string().min(1).optional(),
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

  /*
   * 0 — the solution-level gate authenticateClientToken applies before anything
   * else about the call is considered. This route resolves a credential ROW
   * rather than a bearer token, so it never passed through that function, and a
   * RETIRED solution's console run went on working after every deployed call
   * against it had started failing. Same check, same function, stated first.
   */
  const runtime = await checkSolutionRuntime(scope.organizationId, iface.solutionId);
  if (!runtime.ok) {
    return refusalOk(
      runtime.reason,
      runtime.reason === "SOLUTION_RETIRED"
        ? "This solution is RETIRED, so every call its deployed application makes is refused — this one included. Reactivate the solution to run against it."
        : "The solution that owns this interface no longer exists. (This is the refusal the deployed application would receive.)",
    );
  }

  // The solution's runtime credential row — the identity the deployed app
  // holds. No credential means the app's first call would 401; say exactly that.
  const now = new Date();
  const liveClients = (
    await prisma.solutionClient.findMany({
      where: scopedWhere(scope, {
        solutionId: iface.solutionId,
        isActive: true,
        revokedAt: null,
        ...(input.clientId ? { id: input.clientId } : {}),
      }),
      select: { id: true, environment: true, sapClient: true, expiresAt: true },
      orderBy: { createdAt: "asc" },
    })
  ).filter((c) => c.expiresAt === null || c.expiresAt.getTime() > now.getTime());
  if (liveClients.length === 0) {
    return refusalOk(
      "NO_CREDENTIAL",
      input.clientId
        ? "That credential is no longer live (revoked, expired or not this solution's). Pick another, or issue one under API Access."
        : "This solution has no live runtime credential, so its deployed application cannot call anything. Issue one under API Access — this console runs with the same identity.",
    );
  }
  if (liveClients.length > 1) {
    return refusalOk(
      "AMBIGUOUS_CREDENTIAL",
      `This solution holds live credentials for ${liveClients.map((c) => c.environment).join(", ")}. Pick which one to run as — each binds to a different system.`,
    );
  }
  const client = liveClients[0]!;

  /*
   * THE SAME PER-CREDENTIAL BUCKET THE NORTHBOUND ROUTES USE (audit E18).
   *
   * This route runs the real read pipeline against a real tenant, so it is the
   * one console surface that amplifies onto a customer's SAP system exactly like
   * a deployed application — and it was covered only by middleware's IP-keyed
   * `sapLive` bucket. An IP key is the wrong shape here for the same two reasons
   * it is wrong on the data route: several consultants behind one office address
   * throttle each other, and the budget is not the one the credential being
   * exercised actually has.
   *
   * Keyed `northbound:` — the READ bucket, deliberately, not a third one. The
   * point of the dry run is that it spends what the real call would spend, so a
   * console session that would exhaust the application's budget exhausts it here
   * too and the builder finds out in Studio rather than in production.
   */
  const rate = await checkRateLimit(`northbound:${client.id}`, RATE_LIMITS.northbound);
  if (!rate.allowed) {
    await recordNorthboundCall({
      organizationId: scope.organizationId,
      solutionId: iface.solutionId,
      interfaceId: iface.id,
      operation: "READ",
      externalId: iface.externalId,
      environment: client.environment,
      status: 429,
      rowCount: null,
      correlationId,
      clientTokenId: client.id,
      dryRun: true,
    });
    return refusalOk(
      "RATE_LIMITED",
      `This credential has spent its budget of ${RATE_LIMITS.northbound.limit} calls a minute — the same budget the deployed application shares. ` +
        `Wait ${Math.ceil(rate.resetMs / 1000)}s and run again.`,
    );
  }

  /*
   * AND RECORD THE USE. `lastUsedAt` is how an unused credential is spotted and
   * retired, and how a leaked one shows activity. The deployed application's own
   * calls update it (`touchClientLastUsed`); a console run exercises the same
   * credential against the same tenant and left it untouched, so a credential
   * used daily from Studio looked dormant on the operations board. Fire-and-
   * forget, exactly as the northbound routes do it: failing to stamp a timestamp
   * must never fail the run.
   */
  void touchClientLastUsed(client.id, scope.organizationId);

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
  const entitySet = iface.entitySet;
  if (input.entity !== undefined && input.entity !== entitySet) {
    await audit(400, null, { connectionId: connection.id, connectionEnvironment: connection.environment });
    return refusalOk(
      "ENTITY_NOT_YOURS_TO_CHOOSE",
      `This run asked for "${input.entity}", but this feed serves ${entitySet ? `"${entitySet}"` : "no dataset yet"}. ` +
        "The dataset is part of the feed's definition — the deployed application cannot choose one either, " +
        "so a run against a different dataset would not tell you anything about the real call. " +
        "Change the feed's dataset in Studio, or re-record this case.",
    );
  }
  if (!service || !entitySet) {
    await audit(400, null, { connectionId: connection.id, connectionEnvironment: connection.environment });
    return refusalOk(
      "NO_ENTITY_SET",
      service
        ? access.iface.draft
          ? "This feed is still a draft and names no dataset yet. Set its entity set in Studio — the deployed application reads that value and nothing else."
          : "This feed names no dataset. Set its entity set in Studio — the deployed application reads that value and nothing else."
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
