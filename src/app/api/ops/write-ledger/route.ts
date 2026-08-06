/**
 * GET /api/ops/write-ledger — what the gated write path has been doing.
 *
 * TWO SOURCES, AND THEY DO NOT RECONCILE ROW-FOR-ROW. That is a property of the
 * design, not a defect, and this endpoint states it rather than letting an
 * operator discover the mismatch and read it as a leak.
 *
 * From `NorthboundIdempotencyKey`, which is the only thing with row state:
 *   - in-flight  — reserved, no terminal status yet, not past its TTL
 *   - completed  — a stored 2xx
 *   - failed     — a stored 4xx/5xx, kept so a retry replays the same refusal
 *
 * NOT row states, and deliberately not presented as filterable ones:
 *   - "replayed"   — a REQUEST-TIME response. A replay re-serves the stored
 *                    outcome without mutating the row; nothing counts it.
 *   - "conflicted" — likewise computed (PAYLOAD_MISMATCH / IN_FLIGHT) and
 *                    returned, never written.
 * Their only persisted trace is a 409 in the audit feed, so they are reported
 * from there, as events.
 *
 * WHY THE COUNTS DRIFT. "Blocked" has two shapes:
 *   1. Refused BEFORE reserving — the write-credential gate. No row is ever
 *      created.
 *   2. Refused AFTER reserving but before SAP — no matching connection, writes
 *      not enabled, no entity set. A row IS created, then deleted when the
 *      reservation is released.
 * Both end at zero rows, but only the second makes the in-flight count fall with
 * nothing having completed. Spelling out the mechanism is what makes the drift
 * comprehensible instead of alarming.
 *
 * THE WRITE PATH IS LIVE. Write-credential issuance shipped
 * (/api/studio/clients/write-credential, owner decision reversing the earlier
 * hold), so an empty ledger now means what an empty ledger looks like it
 * means: no solution in scope has performed a write in this window. The
 * "expect this to be empty — no code path issues a write credential" era is
 * over; prose claiming it survives only as history in this comment.
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { opsLimit, opsWhere, opsWindowHours, requireOperations } from "@/lib/ops/guard";
import { studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireOperations();
  if (!guard.ok) return guard.response;

  const params = request.nextUrl.searchParams;
  const hours = opsWindowHours(params.get("hours"));
  const limit = opsLimit(params.get("limit"));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const now = new Date();

  // Shared `where`s, so the counts below and the row pages cannot diverge.
  const keyWhere = opsWhere(guard.actor, { createdAt: { gte: since } });
  const failedWriteWhere = opsWhere(guard.actor, {
    operation: "WRITE",
    at: { gte: since },
    status: { gte: 400 },
  });

  const [keys, writeEvents, keyTotal, staleCount, inFlightCount, completedCount, failedCount, conflicts, blocked] =
    await Promise.all([
      prisma.northboundIdempotencyKey.findMany({
        where: keyWhere,
        // responseBody is DELIBERATELY not selected: it holds the record created
        // in a customer's SAP system. An operations console needs to know a write
        // happened, never what was in it.
        select: {
          id: true,
          solutionId: true,
          interfaceId: true,
          status: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.northboundAuditEvent.findMany({
        where: failedWriteWhere,
        select: {
          id: true,
          at: true,
          solutionId: true,
          interfaceId: true,
          externalId: true,
          status: true,
          correlationId: true,
          clientTokenId: true,
        },
        orderBy: { at: "desc" },
        take: limit,
      }),

      // COUNTED OVER THE WINDOW, NOT OVER THE PAGE.
      //
      // These four were tallied by looping the `keys` page, so a window with
      // 5,000 reservations reported at most `limit` of them and the four
      // buckets summed to the page size. `staleReservation` is the number an
      // operator may actually need to act on, which makes undercounting it the
      // worst of the four.
      prisma.northboundIdempotencyKey.count({ where: keyWhere }),
      // Reserved, no outcome, past its TTL: the request died between reserving
      // and completing. A client retrying that key gets 409 until it lapses.
      prisma.northboundIdempotencyKey.count({
        where: { ...keyWhere, status: null, expiresAt: { lte: now } },
      }),
      prisma.northboundIdempotencyKey.count({
        where: { ...keyWhere, status: null, expiresAt: { gt: now } },
      }),
      prisma.northboundIdempotencyKey.count({ where: { ...keyWhere, status: { lt: 400 } } }),
      prisma.northboundIdempotencyKey.count({ where: { ...keyWhere, status: { gte: 400 } } }),

      prisma.northboundAuditEvent.count({ where: { ...failedWriteWhere, status: 409 } }),
      prisma.northboundAuditEvent.count({
        where: { ...failedWriteWhere, status: { not: 409 } },
      }),
    ]);

  return studioOk({
    windowHours: hours,
    since: since.toISOString(),
    scope: guard.actor.kind,
    // From the key table — these are real row states, over the whole window.
    reservations: {
      inFlight: inFlightCount,
      completed: completedCount,
      failed: failedCount,
      staleReservation: staleCount,
      total: keyTotal,
    },
    // From the audit feed — these are events, not states.
    fromAudit: { blocked, conflicts },
    truncated: keyTotal > keys.length || conflicts + blocked > writeEvents.length,
    provenance: {
      // Rendered on the screen, not buried: the two panels above count different
      // things and will not add up.
      sourcesDoNotReconcile: true,
      why: [
        "a write refused at the credential gate never reserves a key, so it appears only in the audit feed",
        "a write refused after reserving but before SAP has its reservation deleted, so the in-flight count can fall with nothing completing",
        "replayed and conflicted are computed at request time and never stored as row state — they are reported from the audit feed as events",
      ],
      emptyByDesign:
        keyTotal === 0
          ? "No write has reserved a key in this window. Writes require a write key (issued in Developer Studio against a live write grant), a matching grant, a declared-environment connection with writes enabled, and an Idempotency-Key — a refusal at any earlier gate appears in the audit feed, never here."
          : null,
      // The counts above are window-wide; these two arrays are pages of it.
      rowsAreAPage: {
        reservationRows: { returned: keys.length, of: keyTotal },
        auditRows: { returned: writeEvents.length, of: conflicts + blocked },
        limit,
      },
    },
    reservationRows: keys.map((k) => ({
      id: k.id,
      solutionId: k.solutionId,
      interfaceId: k.interfaceId,
      state:
        k.status === null
          ? k.expiresAt.getTime() <= now.getTime()
            ? "stale-reservation"
            : "in-flight"
          : k.status < 400
            ? "completed"
            : "failed",
      status: k.status,
      createdAt: k.createdAt.toISOString(),
      expiresAt: k.expiresAt.toISOString(),
    })),
    auditRows: writeEvents.map((e) => ({
      id: e.id,
      at: e.at.toISOString(),
      solutionId: e.solutionId,
      interfaceId: e.interfaceId,
      externalId: e.externalId,
      status: e.status,
      kind: e.status === 409 ? "conflict" : "blocked",
      correlationId: e.correlationId,
      clientTokenId: e.clientTokenId,
    })),
  });
}
