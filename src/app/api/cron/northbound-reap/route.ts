/** GET: reap expired northbound idempotency keys — Vercel Cron, or manual. */

import { NextResponse, type NextRequest } from "next/server";

import { reapExpiredIdempotencyKeys } from "@/lib/northbound/reap";
import { authorizeCron, recordCronRun } from "@/lib/ops/cron";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // CRON_SECRET, always, compared in constant time — via the ONE shared
  // helper. This endpoint deletes rows, so an unauthenticated caller must not
  // even be able to probe whether it exists by timing it.
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const result = await reapExpiredIdempotencyKeys();
  await recordCronRun("northbound-reap", startedAt, true, {
    deleted: result.deleted,
    moreRemaining: result.moreRemaining,
  });

  return NextResponse.json({
    data: {
      deleted: result.deleted,
      // Surfaced rather than swallowed: a run that hit its cap has NOT cleared
      // the backlog, and reporting "deleted: 5000" alone would read as done.
      moreRemaining: result.moreRemaining,
      reapedAt: new Date().toISOString(),
    },
  });
}
