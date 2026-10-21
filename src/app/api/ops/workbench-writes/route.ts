/**
 * GET /api/ops/workbench-writes — the changes people made to a live SAP system
 * from the Workbench, outside the broker (P0.7).
 *
 * READS `PlatformAuditEvent` and its `PlatformAuditOutcome`. Never writes: the
 * pair is written only by the two routes that change SAP data on a person's
 * say-so (`/api/sap/tdd/write`, `/api/sap/tdd/hub-content/write-test`), the
 * event before SAP is called, and this module is a consumer of it.
 *
 * GATED TO `platform_admin` ALONE (via requireAdmin), NOT BY THE TENANT-SCOPED
 * OPS GUARD. The same reasoning as /api/ops/catalogue-health: these rows have
 * no organization. The writes go to the deployment's own `{PREFIX}_*` tenant,
 * which no organization owns, and they are made by platform admins. Putting
 * them behind `requireOperations` would either show a `support` user in one
 * organization what the platform's admins did, or — scoped by organization —
 * return nothing for everyone while appearing to work.
 *
 * NO PAYLOAD. The table holds a SHA-256 and the field names, never values, and
 * this endpoint returns neither: an operator needs to know THAT a write
 * happened, what it hit and how it ended.
 *
 * AN EVENT WITH NO OUTCOME is a write recorded before SAP was called whose
 * result was never recorded. Within a few minutes that is a request still
 * running (`PENDING`); after `PENDING_UNRESOLVED_AFTER_MINUTES` it is a write
 * nobody knows the result of, and SAP must be checked before it is repeated.
 * The two are told apart here, so the screen does not have to guess.
 */

import type { NextRequest, NextResponse } from "next/server";

import {
  NO_OUTCOME_RECORDED,
  PENDING_UNRESOLVED_AFTER_MINUTES,
  PLATFORM_AUDIT_ACTIONS,
  PLATFORM_AUDIT_OUTCOMES,
  type PlatformAuditOutcomeKind,
} from "@/lib/audit/platform-audit";
import { isAdminError, requireAdmin } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import { opsLimit, opsWindowHours } from "@/lib/ops/guard";
import { studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

const OUTCOMES = Object.keys(PLATFORM_AUDIT_OUTCOMES) as PlatformAuditOutcomeKind[];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) return auth;

  const params = request.nextUrl.searchParams;
  const hours = opsWindowHours(params.get("hours"));
  const limit = opsLimit(params.get("limit"));
  const now = new Date();
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const unresolvedBefore = new Date(now.getTime() - PENDING_UNRESOLVED_AFTER_MINUTES * 60 * 1000);
  /*
   * WRITES ONLY. Since P0.14b the same table holds the console's reads
   * (action SAP_CONSOLE_READ, written with their outcome in one statement).
   * Counted here, every preview would be a "write" — and one whose outcome
   * row failed to insert would read as UNRESOLVED, "check SAP before
   * repeating it", about a read that changed nothing.
   */
  const actions = { in: [...PLATFORM_AUDIT_ACTIONS] };
  const where = { at: { gte: since }, action: actions };

  // COUNTED OVER THE WINDOW, NOT OVER THE PAGE — the lesson the write ledger
  // learned: a tally of the returned rows sums to the page size.
  const [total, outcomeCounts, noOutcome, unresolved, rows] = await Promise.all([
    prisma.platformAuditEvent.count({ where }),
    Promise.all(
      OUTCOMES.map((outcome) =>
        prisma.platformAuditEvent.count({ where: { ...where, result: { is: { outcome } } } }),
      ),
    ),
    prisma.platformAuditEvent.count({ where: { ...where, result: { is: null } } }),
    prisma.platformAuditEvent.count({
      where: { at: { gte: since, lte: unresolvedBefore }, action: actions, result: { is: null } },
    }),
    prisma.platformAuditEvent.findMany({
      where,
      // payloadSha256 / payloadFields deliberately absent — see the header.
      select: {
        id: true,
        at: true,
        action: true,
        actorUserId: true,
        actorEmail: true,
        actorRole: true,
        actorOrganizationId: true,
        product: true,
        tenantKey: true,
        tenantLabel: true,
        serviceKey: true,
        entitySet: true,
        correlationId: true,
        result: {
          // `detail` is not returned: it can carry the Location SAP answered
          // with, which an operator fetches deliberately, by id, if needed.
          select: { outcome: true, sapStatus: true, reason: true, durationMs: true, at: true },
        },
      },
      orderBy: { at: "desc" },
      take: limit,
    }),
  ]);

  const counts = Object.fromEntries(OUTCOMES.map((o, i) => [o, outcomeCounts[i] ?? 0])) as Record<
    PlatformAuditOutcomeKind,
    number
  >;

  return studioOk({
    windowHours: hours,
    since: since.toISOString(),
    scope: "platform",
    total,
    counts: {
      ...counts,
      // No outcome row yet: still running, or never going to resolve. Split in
      // two because they call for different actions.
      PENDING: noOutcome - unresolved,
      UNRESOLVED: unresolved,
    },
    truncated: total > rows.length,
    provenance: {
      // What each outcome means, sent with the data so the screen and the API
      // cannot describe one differently.
      outcomes: {
        ...PLATFORM_AUDIT_OUTCOMES,
        PENDING: "recorded moments ago, before SAP was called — the request may still be running",
        UNRESOLVED: NO_OUTCOME_RECORDED,
      },
      pendingUnresolvedAfterMinutes: PENDING_UNRESOLVED_AFTER_MINUTES,
      cannotTell: [
        "What was written. Only a fingerprint of each payload is kept, never its values, and it is not shown here.",
        "Writes made outside this deployment — directly in SAP, or by another system using the same communication user.",
        "Writes through the northbound broker. Those are recorded per solution in the write ledger above, not here.",
      ],
      rowsAreAPage: { returned: rows.length, of: total, limit },
    },
    rows: rows.map(({ result, ...r }) => ({
      ...r,
      at: r.at.toISOString(),
      state: result
        ? result.outcome
        : r.at.getTime() <= unresolvedBefore.getTime()
          ? "UNRESOLVED"
          : "PENDING",
      sapStatus: result?.sapStatus ?? null,
      reason: result?.reason ?? null,
      durationMs: result?.durationMs ?? null,
      completedAt: result ? result.at.toISOString() : null,
    })),
  });
}
