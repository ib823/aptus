/** GET: reap expired northbound idempotency keys — Vercel Cron, or manual. */

import { NextResponse, type NextRequest } from "next/server";

import { reapExpiredIdempotencyKeys } from "@/lib/northbound/reap";
import { authorizeCron, recordCronRun, runWithCronLease } from "@/lib/ops/cron";

export const dynamic = "force-dynamic";
// The reaper repeats batches for up to REAP_TIME_BUDGET_MS (240 s); without
// this the platform default would end the function long before the budget,
// and the run would never be recorded at all.
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // CRON_SECRET, always, compared in constant time — via the ONE shared
  // helper. This endpoint deletes rows, so an unauthenticated caller must not
  // even be able to probe whether it exists by timing it.
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // One run at a time: a duplicate delivery records a skip and does nothing.
  return runWithCronLease("northbound-reap", reap);
}

async function reap(): Promise<NextResponse> {
  const startedAt = new Date();
  const result = await reapExpiredIdempotencyKeys();
  // A run that spent its budget with expired keys still queued fell behind,
  // and is recorded as not ok rather than as a success with a buried flag.
  await recordCronRun("northbound-reap", startedAt, !result.moreRemaining, {
    deleted: result.deleted,
    moreRemaining: result.moreRemaining,
  });

  return NextResponse.json({
    data: {
      deleted: result.deleted,
      // Surfaced rather than swallowed: a run that stopped on its budget has NOT
      // cleared the backlog, and reporting "deleted: N" alone would read as done.
      moreRemaining: result.moreRemaining,
      reapedAt: new Date().toISOString(),
    },
  });
}
