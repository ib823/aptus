/**
 * GET: probe every active SAP connection — Vercel Cron, or manual.
 *
 * Read-only $metadata per connection, the same probe the Studio test performs.
 * This is what turns the Operations health screen from "the last time a
 * builder happened to click Test" into a fact with a freshness: the chip's
 * "as at" is at most one sweep old, drift raises an incident and an alert,
 * and the run itself is recorded in CronRunLog so a missing sweep is visible.
 */

import { NextResponse, type NextRequest } from "next/server";

import { authorizeCron, recordCronRun } from "@/lib/ops/cron";
import { sweepConnectionProbes } from "@/lib/ops/connection-probe-sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  try {
    const result = await sweepConnectionProbes();
    await recordCronRun("connection-probes", startedAt, true, {
      probed: result.probed,
      skippedNoPath: result.skippedNoPath,
      unreadable: result.unreadable,
      byStatus: result.byStatus,
      transitions: result.transitions.length,
      alertsSent: result.alertsSent,
    });
    return NextResponse.json({ data: result });
  } catch (err) {
    await recordCronRun("connection-probes", startedAt, false, {
      error: err instanceof Error ? err.message : "sweep failed",
    });
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}
