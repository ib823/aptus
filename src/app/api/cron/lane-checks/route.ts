/**
 * GET: probe and read every active lane — Vercel Cron, or manual.
 *
 * WHY THIS ROUTE EXISTS. `sweepLaneChecks` was written, tested and exported by
 * PR-6a, and called by nothing. The `LaneCheck` ledger it fills is the only
 * thing `listLanes` joins evidence from, so with no caller every lane in
 * production derived to Unknown and every status rendered "never checked" —
 * correct, and the exact opposite of the point. Two comments called the sweep
 * "scheduled" while it was not; this is what makes them true.
 *
 * IT RUNS AFTER THE CONNECTION SWEEP, not beside it. A lane read through a
 * connection that went dark overnight should be recorded against a connection
 * already known to be failing, so the two sweeps read in the order a human
 * would: does the system answer, then can this app read this dataset.
 *
 * The secret gate, the CronRunLog rows and the concurrency bound are the ones
 * every other scheduled job uses — `authorizeCron`, `recordCronRun`, and the
 * sweep's own four-at-a-time worker pool. A cron with its own copy of any of
 * those is a cron that drifts from the rest.
 */

import { NextResponse, type NextRequest } from "next/server";

import { authorizeCron, recordCronRun } from "@/lib/ops/cron";
import { sweepLaneChecks } from "@/lib/ops/lane-check-sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  try {
    const result = await sweepLaneChecks();
    /*
     * THE SKIPPED COUNTS ARE PART OF THE OUTCOME, not noise to trim. A run that
     * checked nothing because no lane has a connection and a run that checked
     * nothing because the sweep broke are different events, and the jobs strip
     * shows only what is recorded here.
     */
    await recordCronRun("lane-checks", startedAt, true, {
      checked: result.checked,
      skippedNoConnection: result.skippedNoConnection,
      skippedNoEntitySet: result.skippedNoEntitySet,
      unreadable: result.unreadable,
      byReadStatus: result.byReadStatus,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    await recordCronRun("lane-checks", startedAt, false, {
      error: err instanceof Error ? err.message : "sweep failed",
    });
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
