/**
 * GET /api/control-tower/usage — CoreEdge consumption over time, from the
 * nightly rollups and NOTHING ELSE.
 *
 * The screen this serves is the data pricing will be chosen from, so its two
 * rules are load-bearing:
 *
 *   1. ROLLUPS ONLY. Live aggregation over NorthboundAuditEvent would put an
 *      unbounded scan behind an interactive request and get slower every week.
 *      If a day is missing here, the nightly job has not covered it yet — an
 *      absence the payload states, never papers over.
 *   2. A FLOOR, NOT A CENSUS — inherited from the audit feed the rollups roll
 *      up. Under-counting is in the customer's favour, which is the only
 *      acceptable direction for billing-adjacent numbers to be wrong in.
 */

import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { opsWhere, requireControlTower } from "@/lib/ops/guard";
import { studioOk } from "@/lib/studio/api";

export const dynamic = "force-dynamic";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;

export async function GET(request: NextRequest) {
  const guard = await requireControlTower();
  if (!guard.ok) return guard.response;

  const raw = Number.parseInt(request.nextUrl.searchParams.get("days") ?? "", 10);
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_DAYS) : DEFAULT_DAYS;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [rows, lastRun] = await Promise.all([
    prisma.coreEdgeUsageRollup.findMany({
      where: opsWhere(guard.actor, { day: { gte: since } }),
      orderBy: { day: "desc" },
      select: {
        organizationId: true,
        day: true,
        calls: true,
        rowsRead: true,
        writes: true,
        refusals: true,
        distinctInterfaces: true,
        distinctCredentials: true,
        computedAt: true,
      },
    }),
    prisma.cronRunLog.findFirst({
      where: { job: "coreedge-usage" },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true, ok: true },
    }),
  ]);

  const totals = rows.reduce(
    (t, r) => ({
      calls: t.calls + r.calls,
      rowsRead: t.rowsRead + r.rowsRead,
      writes: t.writes + r.writes,
      refusals: t.refusals + r.refusals,
    }),
    { calls: 0, rowsRead: 0, writes: 0, refusals: 0 },
  );

  return studioOk({
    scope: guard.actor.kind,
    windowDays: days,
    totals,
    days: rows.map((r) => ({
      organizationId: r.organizationId,
      day: r.day.toISOString(),
      calls: r.calls,
      rowsRead: r.rowsRead,
      writes: r.writes,
      refusals: r.refusals,
      distinctInterfaces: r.distinctInterfaces,
      distinctCredentials: r.distinctCredentials,
      computedAt: r.computedAt.toISOString(),
    })),
    lastRollupRun: lastRun
      ? { finishedAt: lastRun.finishedAt.toISOString(), ok: lastRun.ok }
      : null,
    provenance: {
      rollupsOnly:
        "Every number is a stored nightly rollup row. Nothing on this response aggregates the audit table live — a missing day means the nightly job has not covered it, and it appears when the job does.",
      floorNotCensus:
        "The rollups inherit the audit feed's floor: calls throttled at the edge, calls that timed out before the audit write, and calls whose audit write failed are absent here too. These numbers under-count in the customer's favour.",
      noBilling:
        "No payment processor is wired and nothing here bills anyone. This is the consumption record pricing will be chosen from.",
    },
  });
}
