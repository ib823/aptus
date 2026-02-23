/** GET: Public health check endpoint */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(): Promise<NextResponse> {
  let dbStatus: "up" | "down" = "down";
  let dbLatencyMs = 0;

  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - start;
    dbStatus = "up";
  } catch {
    dbStatus = "down";
  }

  const status = dbStatus === "down" ? "unhealthy" : dbLatencyMs > 1000 ? "degraded" : "healthy";
  const statusCode = status === "unhealthy" ? 503 : 200;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: dbStatus, latencyMs: dbLatencyMs },
      },
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.npm_package_version ?? "dev",
    },
    { status: statusCode },
  );
}
