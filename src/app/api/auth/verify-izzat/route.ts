import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { createSession, SESSION_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth/session";
import { isIpAllowed, logBackdoorAttempt } from "@/lib/auth/test-backdoor-guards";

const ENDPOINT = "/api/auth/verify-izzat";

/**
 * Simulation bridge.
 *
 * This endpoint is intentionally disabled by default and requires:
 * - ENABLE_SIMULATION_BRIDGE=true
 * - SIMULATION_BRIDGE_SECRET to be configured (>=24 chars in production)
 * - secret in request body that matches SIMULATION_BRIDGE_SECRET
 *
 * Optional defense in depth:
 * - SIMULATION_BRIDGE_ALLOWED_IPS — comma-separated allow-list. When set,
 *   the source IP must match.
 *
 * Every attempt (success and failure) is audit-logged via logBackdoorAttempt
 * so it surfaces in Vercel runtime logs / Sentry breadcrumbs.
 */
export async function POST(request: NextRequest) {
  const bridgeEnabled = process.env.ENABLE_SIMULATION_BRIDGE === "true";
  const bridgeSecret = process.env.SIMULATION_BRIDGE_SECRET;

  if (!bridgeEnabled || !bridgeSecret) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  // Refuse trivially-short secrets in production — a 4-char secret protecting
  // a real session is a configuration mistake, not a working setup.
  if (process.env.NODE_ENV === "production" && bridgeSecret.length < 24) {
    logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:env", headers: request.headers });
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  if (!isIpAllowed(request.headers, "SIMULATION_BRIDGE_ALLOWED_IPS")) {
    logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:ip", headers: request.headers });
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
    logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:secret", headers: request.headers });
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
    logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:user", headers: request.headers, email });
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
    ...getSessionCookieOptions(),
  });

  logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "success", headers: request.headers, email });

  return response;
}
