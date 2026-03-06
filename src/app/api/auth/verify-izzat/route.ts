import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { APP_CONFIG } from "@/constants/config";

/**
 * Simulation bridge.
 *
 * This endpoint is intentionally disabled by default and requires:
 * - ENABLE_SIMULATION_BRIDGE=true
 * - SIMULATION_BRIDGE_SECRET to be configured
 * - secret in request body that matches SIMULATION_BRIDGE_SECRET
 */
export async function POST(request: NextRequest) {
  const bridgeEnabled = process.env.ENABLE_SIMULATION_BRIDGE === "true";
  const bridgeSecret = process.env.SIMULATION_BRIDGE_SECRET;

  if (!bridgeEnabled || !bridgeSecret) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let body: { secret?: string };
  try {
    body = await request.json() as { secret?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const providedSecret = body.secret;
  if (
    !providedSecret ||
    providedSecret.length !== bridgeSecret.length ||
    !timingSafeEqual(Buffer.from(providedSecret), Buffer.from(bridgeSecret))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = process.env.SIMULATION_BRIDGE_EMAIL ?? "izzat@abeam.com";
  const targetAssessmentName =
    process.env.SIMULATION_BRIDGE_ASSESSMENT ?? "MNC Malaysia Finance Readiness";

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found. Please ensure the simulation data is seeded." },
      { status: 404 },
    );
  }

  // Find the seeded assessment ID
  const assessment = await prisma.assessment.findFirst({
    where: { companyName: targetAssessmentName },
    select: { id: true },
  });

  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const userAgent = request.headers.get("user-agent") ?? "Simulation Bridge";
  const { token } = await createSession(user.id, ipAddress, userAgent);

  const destination = assessment?.id
    ? `/assessment/${assessment.id}/report`
    : "/dashboard";

  const response = NextResponse.json({ redirectTo: destination });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: APP_CONFIG.sessionMaxAgeHours * 60 * 60,
  });

  return response;
}
