/**
 * GET: Nightly trial expiry sweep — triggered by Vercel Cron or manually.
 *
 * checkAndExpireTrials existed since Phase 29 but no cron ever called it, so
 * every trial org stayed TRIALING forever and TRIAL_EXPIRED was unreachable.
 */

import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { checkAndExpireTrials } from "@/lib/commercial/trial-manager";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Protect with CRON_SECRET — always required in production
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !authHeader || !safeCompare(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expired = await checkAndExpireTrials();

  return NextResponse.json({
    data: {
      trialsExpired: expired,
      computedAt: new Date().toISOString(),
    },
  });
}
