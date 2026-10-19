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
 *                    outcome without mutating the row. Its audit row is
 *                    marked `replayed`, so it is counted from the audit feed
 *                    as an event, and never as a second refusal.
 *   - "conflicted" — likewise computed (PAYLOAD_MISMATCH / IN_FLIGHT) and
 *                    returned, never written. Its only persisted trace is a
 *                    409 in the audit feed, so it is reported from there.
 *
 * WHY THE COUNTS DRIFT. Every gate the write route has — the write credential,
 * the throttle, the Idempotency-Key, the interface and its grant, the connection
 * binding, writes-enabled, the entity set — runs BEFORE a key is reserved. So:
 *   - a write refused at any gate never reserves a key, and appears only in the
 *     audit feed;
 *   - a reservation exists only for a write that passed every gate;
 *   - a write that was never sent — the credential could not be used, the CSRF
 *     handshake failed, or SAP declined the POST unprocessed (408/429) — has
 *     its reservation released (deleted), so it too appears only in the audit
 *     feed, and the in-flight count can fall with nothing completing;
 *   - a write SAP may have acted on and refused or failed appears in BOTH
 *     panels: a `failed` reservation, and an audit event.
 * Spelling out the mechanism is what makes the drift comprehensible instead of
 * alarming.
 *
 * AND "BLOCKED" MEANS ONLY BEFORE SAP. Every failed write used to be labelled
 * blocked, including a 504 whose POST timed out and a 502 whose response could
 * not be read — writes SAP may well have committed. An operator asked whether a
 * record landed was told it was blocked, told the customer nothing was written,
 * and the developer resubmitted with a new key: a duplicate in the customer's
 * ledger, the one outcome this path exists to prevent. The audit row says which
 * it was — the route stamps `durationMs` only around the upstream call — so:
 *   blocked          refused at a gate; SAP was never reached
 *   upstream-failed  SAP answered and refused it (4xx); nothing was written
 *   outcome-unknown  502/504 — the write MAY have been applied; check SAP
 *                    before anyone resubmits. Keyed on status, because no
 *                    gate answers 5xx. A replay re-serves the stored status
 *                    without a duration, and is not in this feed at all.
 *                    A 502/504 for a write that was never sent (its key
 *                    released) lands here too: the row does not record which
 *                    side of the POST it failed on, so this errs towards
 *                    checking SAP.
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

/** What one failed write event was. See "BLOCKED MEANS ONLY BEFORE SAP" above. */
type WriteEventKind = "conflict" | "blocked" | "upstream-failed" | "outcome-unknown";

function writeEventKind(status: number, durationMs: number | null): WriteEventKind {
  if (status === 409) return "conflict";
  // No gate answers 5xx: a 502/504 came from the upstream call (replays are
  // kept out of this feed), and the record may be in SAP.
  if (status >= 500) return "outcome-unknown";
  // `durationMs` is stamped only around the upstream call.
  return durationMs != null ? "upstream-failed" : "blocked";
}

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
  // Replays excluded: a same-key retry of a stored failure re-serves it without
  // calling SAP, and counted here it was one more refusal per retry.
  const failedWriteWhere = opsWhere(guard.actor, {
    operation: "WRITE",
    at: { gte: since },
    status: { gte: 400 },
    replayed: false,
  });

  const [
    keys,
    writeEvents,
    keyTotal,
    staleCount,
    inFlightCount,
    completedCount,
    failedCount,
    conflicts,
    blocked,
    upstreamFailed,
    outcomeUnknown,
    replayed,
  ] = await Promise.all([
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
          // Whether SAP was reached: stamped only around the upstream call.
          durationMs: true,
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

      // The four kinds `writeEventKind` assigns, each with its whole status
      // range spelled out: spreading `failedWriteWhere` and then setting
      // `status` REPLACES its `gte: 400`, which is how "blocked" once counted
      // every non-409 write in the window — the 201s included.
      prisma.northboundAuditEvent.count({ where: { ...failedWriteWhere, status: 409 } }),
      prisma.northboundAuditEvent.count({
        where: { ...failedWriteWhere, status: { gte: 400, lt: 500, not: 409 }, durationMs: null },
      }),
      prisma.northboundAuditEvent.count({
        where: { ...failedWriteWhere, status: { gte: 400, lt: 500, not: 409 }, durationMs: { not: null } },
      }),
      prisma.northboundAuditEvent.count({ where: { ...failedWriteWhere, status: { gte: 500 } } }),
      // Replays, which `failedWriteWhere` leaves out: events, not refusals.
      prisma.northboundAuditEvent.count({
        where: opsWhere(guard.actor, { operation: "WRITE", at: { gte: since }, replayed: true }),
      }),
    ]);
  const auditTotal = conflicts + blocked + upstreamFailed + outcomeUnknown;

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
    fromAudit: { blocked, conflicts, upstreamFailed, outcomeUnknown, replayed },
    truncated: keyTotal > keys.length || auditTotal > writeEvents.length,
    provenance: {
      // Rendered on the screen, not buried: the two panels above count different
      // things and will not add up.
      sourcesDoNotReconcile: true,
      why: [
        "every gate runs before a key is reserved, so a write refused at any of them never reserves one and appears only in the audit feed",
        "a write that was never sent (the credential or the CSRF handshake failed, or SAP declined it unprocessed) has its reservation deleted, so the in-flight count can fall with nothing completing",
        "a write SAP may have acted on and refused or failed appears in both: a failed reservation above, and an event in the audit feed",
        "replayed and conflicted are computed at request time and never stored as row state — they are reported from the audit feed as events, and a replayed failure is not counted as another refusal",
      ],
      emptyByDesign:
        keyTotal === 0
          ? "No write has reserved a key in this window. Writes require a write key (issued in Developer Studio against a live write grant), a matching grant, a declared-environment connection with writes enabled, and an Idempotency-Key — a refusal at any earlier gate appears in the audit feed, never here."
          : null,
      // The counts above are window-wide; these two arrays are pages of it.
      rowsAreAPage: {
        reservationRows: { returned: keys.length, of: keyTotal },
        auditRows: { returned: writeEvents.length, of: auditTotal },
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
      kind: writeEventKind(e.status, e.durationMs),
      correlationId: e.correlationId,
      clientTokenId: e.clientTokenId,
    })),
  });
}
