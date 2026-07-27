/** GET: reap expired northbound idempotency keys — Vercel Cron, or manual. */

import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { reapExpiredIdempotencyKeys } from "@/lib/northbound/reap";

export const dynamic = "force-dynamic";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Same gate as the analytics cron: CRON_SECRET, always, compared in constant
  // time. This endpoint deletes rows, so an unauthenticated caller must not even
  // be able to probe whether it exists by timing it.
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || !authHeader || !safeCompare(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await reapExpiredIdempotencyKeys();

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
