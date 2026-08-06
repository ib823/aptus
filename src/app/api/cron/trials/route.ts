/**
 * GET: Nightly trial expiry sweep — triggered by Vercel Cron or manually.
 *
 * checkAndExpireTrials existed since Phase 29 but no cron ever called it, so
 * every trial org stayed TRIALING forever and TRIAL_EXPIRED was unreachable.
 */

import { NextResponse, type NextRequest } from "next/server";

import { checkAndExpireTrials } from "@/lib/commercial/trial-manager";
import { authorizeCron, recordCronRun } from "@/lib/ops/cron";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const expired = await checkAndExpireTrials();
  await recordCronRun("trials", startedAt, true, { trialsExpired: expired });

  return NextResponse.json({
    data: {
      trialsExpired: expired,
      computedAt: new Date().toISOString(),
    },
  });
}
