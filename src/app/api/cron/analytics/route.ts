/** GET: Nightly analytics computation — triggered by Vercel Cron or manually */

import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { runNightlyAnalytics } from "@/lib/analytics/nightly-job";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Protect with CRON_SECRET — always required in production
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !authHeader || !safeCompare(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const result = await runNightlyAnalytics();

  return NextResponse.json({
    data: {
      benchmarksUpdated: result.benchmarksUpdated,
      portfolioMetricsUpdated: result.portfolioMetricsUpdated,
      errors: result.errors,
      computedAt: new Date().toISOString(),
    },
  });
}
