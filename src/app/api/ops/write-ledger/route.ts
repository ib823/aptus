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
 * EXPECT THIS TO BE EMPTY. No code path issues a write credential, so every
 * write is refused at that gate and no key is ever reserved. That is a settled
 * decision, and the empty state is a precise statement about a control that
 * works — not a gap.
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { opsLimit, opsOrgFilter, opsWindowHours, requireOperations } from "@/lib/ops/guard";
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

  const [keys, writeEvents] = await Promise.all([
    prisma.northboundIdempotencyKey.findMany({
      where: { ...opsOrgFilter(guard.actor), createdAt: { gte: since } },
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
      where: {
        ...opsOrgFilter(guard.actor),
        operation: "WRITE",
        at: { gte: since },
        status: { gte: 400 },
      },
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
  ]);

  let inFlight = 0;
  let completed = 0;
  let failed = 0;
  let staleReservation = 0;

  for (const k of keys) {
    if (k.status === null) {
      // Past its TTL with no outcome: the request died between reserving and
      // completing. Surfaced separately because it is the one state an operator
      // may need to act on — a client retrying that key gets 409 until it lapses.
      if (k.expiresAt.getTime() <= now.getTime()) staleReservation++;
      else inFlight++;
    } else if (k.status < 400) completed++;
    else failed++;
  }

  const conflicts = writeEvents.filter((e) => e.status === 409).length;
  const blocked = writeEvents.filter((e) => e.status !== 409).length;

  return studioOk({
    windowHours: hours,
    since: since.toISOString(),
    scope: guard.actor.kind,
    // From the key table — these are real row states.
    reservations: { inFlight, completed, failed, staleReservation, total: keys.length },
    // From the audit feed — these are events, not states.
    fromAudit: { blocked, conflicts },
    truncated: keys.length === limit || writeEvents.length === limit,
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
        keys.length === 0
          ? "No write credential can be issued yet, so every write is refused at the credential gate before a key is reserved."
          : null,
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
