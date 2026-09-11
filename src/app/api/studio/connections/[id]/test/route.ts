/**
 * POST /api/studio/connections/[id]/test — read-only connectivity probe.
 *
 * Runs one GET against the connection's own `$metadata` and records what
 * actually happened. Three rules make this honest rather than decorative:
 *
 *   1. `lastValidatedAt` moves ONLY on a real 200. A failed test leaves the
 *      previous timestamp standing, so the column can never imply a health that
 *      was not observed.
 *   2. The outcome keeps 401/403 ("not set up") apart from 5xx/timeout
 *      ("unreachable"). Collapsing them to a boolean would hide which problem
 *      you have.
 *   3. Nothing about the secret — or the failing URL — reaches the response.
 *
 * Rate limited via `isLiveSapTenantRoute`: this path reaches a client's SAP
 * system, so it belongs in the tight sapLive bucket alongside the other live
 * routes, not the generous default API ceiling.
 */

import type { NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { connectionRefusalMessage, resolveSapConnection } from "@/lib/sap-public/connection-resolver";
import { studioError, studioOk } from "@/lib/studio/api";
import { writeConfigAudit } from "@/lib/studio/audit";
import { probeConnection } from "@/lib/studio/connection-health";
import { canAccessStudio, canMutateStudio, lacksStudioTenantScope } from "@/lib/studio/rbac";

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return studioError("UNAUTHENTICATED", "Sign in required.");
  if (!canAccessStudio(user.role)) {
    return studioError("FORBIDDEN", "Developer Studio is role-gated.");
  }
  if (!canMutateStudio(user.role)) {
    // Probing reaches a client's SAP system and writes a health record; that is
    // a builder action, not something an oversight role should trigger.
    return studioError("FORBIDDEN", "Your role can view connections but not test them.");
  }
  if (lacksStudioTenantScope(user)) {
    return studioError("FORBIDDEN", "No organization scope.");
  }

  const organizationId = user.organizationId;
  if (!organizationId) return studioError("FORBIDDEN", "No organization scope.");

  const { id } = await ctx.params;

  // Re-scope the caller-supplied id to this tenant. A connection in another
  // organization is indistinguishable from one that does not exist.
  const row = await prisma.sapConnection.findFirst({
    where: { id, organizationId },
    select: { id: true, product: true, key: true, label: true, environment: true },
  });
  if (!row) return studioError("NOT_FOUND", "Connection not found.");

  // Resolve WITH secrets — server-side only, never returned. The resolver is
  // itself org-scoped and never falls back to another tenant's row.
  //
  // A ROW WHOSE SECRETS WILL NOT OPEN IS A REFUSAL, NOT A CRASH. The resolver
  // throws when the sealed bundle fails to decrypt — a rotated encryption key,
  // a restored backup, a redeploy with a different SAP_CONNECTION_ENCRYPTION_KEY
  // — and that throw escaped this handler as an unhandled 500 with a stack
  // trace, on the one screen an operator would open to diagnose exactly that.
  // The northbound binding path already catches the same throw and answers
  // CONNECTION_UNREADABLE with an actionable sentence; this is the same
  // treatment one caller over. No probe ran, so no health status is written —
  // "could not even try" must not be recorded as a probe outcome.
  let resolved;
  try {
    resolved = await resolveSapConnection(organizationId, row.product, row.key);
  } catch (err) {
    console.warn("[studio] connection secrets could not be opened", {
      connectionId: row.id,
      reason: err instanceof Error ? err.name : "unknown",
    });
    return studioError(
      "CONFLICT",
      connectionRefusalMessage("CONNECTION_UNREADABLE", row.environment ?? ""),
    );
  }
  if (!resolved) return studioError("NOT_FOUND", "Connection not found.");

  const result = await probeConnection(resolved);

  await prisma.sapConnection.update({
    where: { id: row.id, organizationId },
    data: {
      lastValidationStatus: result.status,
      // Only a real 200 updates the timestamp (see rule 1).
      ...(result.status === "OK" ? { lastValidatedAt: new Date() } : {}),
    },
  });

  // THE MANUAL TEST LEAVES A TRACE. Only the cron sweep and the Ops "Probe now"
  // wrote a SapConnectionProbeEvent; the one probe a human runs while actively
  // diagnosing a connection was the one that left no history in Operations.
  // Same row shape as the sweep, with the source the schema already documented
  // and nothing emitted.
  await prisma.sapConnectionProbeEvent.create({
    data: {
      organizationId,
      connectionId: row.id,
      status: result.status,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
      source: "test",
    },
  });

  await writeConfigAudit({
    organizationId,
    actorId: user.id,
    entityType: "Connection",
    entityId: row.id,
    action: "TEST_CONNECT",
    after: {
      status: result.status,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
    },
  });

  return studioOk({
    status: result.status,
    httpStatus: result.httpStatus,
    detail: result.detail,
    durationMs: result.durationMs,
    validated: result.status === "OK",
  });
}
