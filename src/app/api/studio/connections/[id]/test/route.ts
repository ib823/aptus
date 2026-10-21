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
import { noteConnectionProbe } from "@/lib/coreedge/journey";
import { prisma } from "@/lib/db/prisma";
import { recordUnreadableOne } from "@/lib/ops/connection-probe-sweep";
import { probeEventSource } from "@/lib/ops/probe-event-source";
import { resolveSapConnections } from "@/lib/sap-public/connection-resolver";
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
  // treatment one caller over. No probe ran, so no probe OUTCOME is written —
  // "could not even try" is recorded only as UNREADABLE / GROUP_UNREADABLE,
  // the statuses that say no request reached SAP (as the sweep records them).
  //
  // THE WHOLE PRODUCT GROUP IS OPENED, NOT ONLY THIS ROW (P0.2 review round 4).
  // The broker fails closed on the (organization, product) set: one sibling
  // whose secrets will not open refuses every call for the product. Opening
  // only the named row let this test probe SAP, get a 200 and write a fresh
  // OK — and end the SAP set-up wait — over the GROUP_UNREADABLE the sweep had
  // recorded, so every screen said healthy while the broker refused every
  // call. So the group is judged as "Probe now" and the sweep judge it: when
  // it will not open, the row is recorded UNREADABLE (its own secret fails)
  // or GROUP_UNREADABLE (a sibling's does, named in the answer), through the
  // same revision guard; no probe runs, so no probe event, no success time
  // and no journey milestone.
  let resolved;
  try {
    const group = await resolveSapConnections(organizationId, row.product);
    resolved = group.find((c) => c.key === row.key) ?? null;
  } catch (err) {
    console.warn("[studio] connection secrets could not be opened", {
      connectionId: row.id,
      reason: err instanceof Error ? err.name : "unknown",
    });
    const refused = await recordUnreadableOne(organizationId, row);
    if (refused.outcome === "not-found") return studioError("NOT_FOUND", "Connection not found.");
    // THE STATUS IT RECORDED HAS AN AUTHOR (P0.2 review round 5). Writing
    // UNREADABLE / GROUP_UNREADABLE flips the row on every screen and raises
    // the unhealthy-connection incident; like every other path of this route,
    // the change is audited under the builder who pressed Test, marked as
    // never having reached SAP. Nothing written, nothing to attribute.
    if (refused.outcome === "unreadable" && refused.recorded) {
      await writeConfigAudit({
        organizationId,
        actorId: user.id,
        entityType: "Connection",
        entityId: row.id,
        action: "TEST_CONNECT",
        after: { status: refused.recorded, reachedSap: false },
      });
    }
    return studioError("CONFLICT", refused.detail);
  }
  if (!resolved) return studioError("NOT_FOUND", "Connection not found.");

  const result = await probeConnection(resolved);

  /*
   * ONLY ONTO THE SETTINGS THAT WERE PROBED (P0.2 review). A re-save while
   * this test waited on SAP keeps the row's id, points it somewhere else,
   * bumps `revision` and clears the status to "never tested". Writing this
   * answer then would call the NEW settings healthy on the OLD tenant's 200.
   * So the write names the revision the probe read through, and a write that
   * matches nothing records no status and no history for the new settings.
   *
   * BUT THE REQUEST STILL REACHED SAP, AND SOMEONE CAUSED IT (P0.2 review
   * round 3). The probe went to the old host with the old credentials; when
   * someone asks why their estate saw traffic at 14:07 the answer has to name
   * a person. So a superseded test still writes its audit row, marked
   * `superseded`, and its probe event, under a source the history readers
   * skip (`probeEventSource`): a trace, not the new settings' health.
   */
  const written =
    resolved.revision === undefined
      ? { count: 0 }
      : await prisma.sapConnection.updateMany({
          where: { id: row.id, organizationId, revision: resolved.revision },
          data: {
            lastValidationStatus: result.status,
            // Only a real 200 updates the timestamp (see rule 1).
            ...(result.status === "OK" ? { lastValidatedAt: new Date() } : {}),
          },
        });
  const superseded = written.count === 0;

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
      source: probeEventSource("test", superseded),
    },
  });

  if (superseded) {
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
        superseded: true,
      },
    });
    return studioError(
      "CONFLICT",
      "The connection changed while it was being tested, so the result was about its previous settings and was not recorded as its health. Test it again.",
    );
  }
  // A connection's first good probe ends its SAP set-up wait (P2.12).
  await noteConnectionProbe({
    organizationId,
    connectionId: row.id,
    environment: row.environment,
    status: result.status,
    actorUserId: user.id,
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
