/** GET: Health check endpoint (Phase 27) */

import { NextResponse } from "next/server";
import { requireAdmin, isAdminError } from "@/lib/auth/admin-guard";
import { prisma } from "@/lib/db/prisma";
import type { HealthCheck, HealthStatus, ServiceStatus } from "@/types/pwa";

export const preferredRegion = "sin1";
export const maxDuration = 30;

export async function GET(): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (isAdminError(auth)) {
    return auth;
  }

  let dbStatus: ServiceStatus = "down";
  let dbLatencyMs = 0;

  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - start;
    dbStatus = "up";
  } catch {
    dbStatus = "down";
  }

  let overallStatus: HealthStatus = "healthy";
  if (dbStatus === "down") {
    overallStatus = "unhealthy";
  } else if (dbLatencyMs > 1000) {
    overallStatus = "degraded";
  }

  const health: HealthCheck = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    checks: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
    },
  };

  const statusCode = overallStatus === "unhealthy" ? 503 : 200;

  return NextResponse.json({ data: health }, { status: statusCode });
}
