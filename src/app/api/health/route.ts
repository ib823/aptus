/** GET: Public health check endpoint — minimal, no sensitive data */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET(): Promise<NextResponse> {
  let dbStatus: "up" | "down" = "down";

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "up";
  } catch {
    dbStatus = "down";
  }

  const status = dbStatus === "down" ? "unhealthy" : "healthy";
  const statusCode = status === "unhealthy" ? 503 : 200;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
    },
    { status: statusCode },
  );
}
