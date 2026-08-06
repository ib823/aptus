/** GET: Nightly analytics computation — triggered by Vercel Cron or manually */

import { NextResponse, type NextRequest } from "next/server";

import { runNightlyAnalytics } from "@/lib/analytics/nightly-job";
import { authorizeCron, recordCronRun } from "@/lib/ops/cron";

// Cron responses must never be served from a cache — the response IS the run.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  // CRON_SECRET, always, constant-time — one shared helper, not a fourth copy.
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const result = await runNightlyAnalytics();
  await recordCronRun("analytics", startedAt, result.errors.length === 0, {
    benchmarksUpdated: result.benchmarksUpdated,
    portfolioMetricsUpdated: result.portfolioMetricsUpdated,
    errors: result.errors,
  });

  return NextResponse.json({
    data: {
      benchmarksUpdated: result.benchmarksUpdated,
      portfolioMetricsUpdated: result.portfolioMetricsUpdated,
      errors: result.errors,
      computedAt: new Date().toISOString(),
    },
  });
}
