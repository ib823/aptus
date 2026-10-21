/**
 * GET: enforce northbound audit retention — Vercel Cron, or manual.
 *
 * The counterpart to `northbound-reap`: that one bounds the idempotency table,
 * this one bounds the audit table. Both are platform maintenance sweeps, both
 * are gated on CRON_SECRET in constant time, and both record their run in
 * CronRunLog so a sweep that stops happening is visible rather than silent.
 *
 * A MISCONFIGURED PERIOD DELETES NOTHING. `resolveRetentionDays` refuses an
 * out-of-range or unparseable value instead of clamping it, and this route turns
 * that refusal into a recorded, failed run. Failing to delete is recoverable;
 * deleting on a misread setting is not.
 */

import { NextResponse, type NextRequest } from "next/server";

import { enforceNorthboundAuditRetention, resolveRetentionDays } from "@/lib/northbound/retention";
import { authorizeCron, recordCronRun, runWithCronLease } from "@/lib/ops/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // One run at a time: a duplicate delivery records a skip and does nothing.
  return runWithCronLease("northbound-retention", enforceRetention);
}

async function enforceRetention(): Promise<NextResponse> {
  const startedAt = new Date();
  const config = resolveRetentionDays();
  if (!config.ok) {
    await recordCronRun("northbound-retention", startedAt, false, { error: config.reason });
    return NextResponse.json({ error: config.reason }, { status: 500 });
  }

  try {
    const result = await enforceNorthboundAuditRetention(new Date(), config.days);
    /*
     * A RUN THAT FELL BEHIND IS NOT A SUCCESS. `moreRemaining` means the sweep
     * spent its time budget with rows past the stated period still in the
     * table — the retention this route exists to enforce did not happen. It was
     * recorded `ok: true` with the flag buried in the summary, so a backlog that
     * grew every night read as a healthy job every night.
     */
    await recordCronRun("northbound-retention", startedAt, !result.moreRemaining, {
      deleted: result.deleted,
      // The console's platform-scope read rows, expired on the same period (P0.14b).
      consoleReadsDeleted: result.consoleReadsDeleted,
      // Surfaced rather than swallowed: a run that stopped on its budget has
      // NOT cleared the backlog, and "deleted: N" alone would read as done.
      moreRemaining: result.moreRemaining,
      retentionDays: result.retentionDays,
      retentionSource: config.source,
      cutoff: result.cutoff,
    });
    return NextResponse.json({ data: { ...result, retentionSource: config.source } });
  } catch (err) {
    await recordCronRun("northbound-retention", startedAt, false, {
      error: err instanceof Error ? err.message : "retention sweep failed",
    });
    return NextResponse.json({ error: "Retention sweep failed" }, { status: 500 });
  }
}
