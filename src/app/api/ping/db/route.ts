/** DB connectivity diagnostic — no auth, tests Prisma connection */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";
export const maxDuration = 30;

export async function GET() {
  const start = Date.now();
  try {
    const result = await prisma.$queryRaw<[{ now: Date }]>`SELECT NOW() as now`;
    const latency = Date.now() - start;
    return NextResponse.json({
      ok: true,
      region: process.env.VERCEL_REGION ?? "unknown",
      dbLatency: `${latency}ms`,
      dbTime: result[0]?.now,
    });
  } catch (err) {
    const latency = Date.now() - start;
    return NextResponse.json({
      ok: false,
      region: process.env.VERCEL_REGION ?? "unknown",
      latency: `${latency}ms`,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
