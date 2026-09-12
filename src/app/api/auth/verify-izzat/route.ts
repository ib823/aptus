import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { getClientIp } from "@/lib/security/client-ip";
import { createSession, SESSION_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth/session";
import {
  isIpAllowed,
  logBackdoorAttempt,
  productionBackdoorBlock,
  recordBackdoorSuccess,
} from "@/lib/auth/test-backdoor-guards";
import { ALL_USER_ROLES } from "@/types/assessment";

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

  // Runtime production kill-switch. The build-time env check (check-production-env.js)
  // already blocks Vercel deploys that carry ENABLE_SIMULATION_BRIDGE, but that gate
  // can be skipped (non-Vercel runtime, env set post-build). Refuse in production
  // unless explicitly opted in — parity with test-login's ALLOW_TEST_LOGIN_IN_PROD.
  // The deploy-time acknowledgement, checked at runtime — see
  // productionBackdoorBlock. `ALLOW_SIMULATION_BRIDGE_IN_PROD` alone is a
  // variable an operator can set after the build; INTERNAL_TEST_DEPLOYMENT is the
  // second, deliberate signal check-production-env.js has always required.
  const productionBlock = productionBackdoorBlock();
  if (productionBlock) {
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:env", headers: request.headers });
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_SIMULATION_BRIDGE_IN_PROD !== "true"
  ) {
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:env", headers: request.headers });
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  // Refuse trivially-short secrets in production — a 4-char secret protecting
  // a real session is a configuration mistake, not a working setup.
  if (process.env.NODE_ENV === "production" && bridgeSecret.length < 24) {
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:env", headers: request.headers });
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  if (!isIpAllowed(request.headers, "SIMULATION_BRIDGE_ALLOWED_IPS")) {
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:ip", headers: request.headers });
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
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:secret", headers: request.headers });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = process.env.SIMULATION_BRIDGE_EMAIL ?? "izzat@abeam.com";
  const targetAssessmentName =
    process.env.SIMULATION_BRIDGE_ASSESSMENT ?? "MNC Malaysia Finance Readiness";

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (!user) {
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:user", headers: request.headers, email });
    return NextResponse.json(
      { error: "User not found. Please ensure the simulation data is seeded." },
      { status: 404 },
    );
  }

  /*
   * THE ROLE MUST BE ONE THE PRODUCT KNOWS.
   *
   * test-login validates the role it is ASKED for (a secret holder could
   * otherwise write any string into User.role). This bridge does not take a role
   * — it signs in a seeded user — so the equivalent check is on the role that
   * user already carries. A user seeded with a role outside the union produces a
   * session no screen can reason about: every `role === "consultant"` test fails,
   * every hierarchy comparison reads undefined, and the failure surfaces far from
   * the seed that caused it. Refused here, where the cause is still visible.
   */
  if (!(ALL_USER_ROLES as readonly string[]).includes(user.role)) {
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:role", headers: request.headers, email });
    return NextResponse.json(
      {
        error:
          `The simulation user's role (${user.role}) is not one this product knows. ` +
          `Re-seed it with one of: ${ALL_USER_ROLES.join(", ")}.`,
      },
      { status: 409 },
    );
  }

  // Find the seeded assessment ID
  const assessment = await prisma.assessment.findFirst({
    where: { companyName: targetAssessmentName },
    select: { id: true },
  });

  // Recorded before the session exists, and refused if it cannot be — see
  // recordBackdoorSuccess. Same reasoning as test-login.
  const recorded = await recordBackdoorSuccess({
    endpoint: ENDPOINT,
    headers: request.headers,
    email,
    userId: user.id,
  });
  if (!recorded) {
    return NextResponse.json(
      { error: "The simulation bridge is unavailable: the attempt could not be audited." },
      { status: 503 },
    );
  }

  const trustedIp = getClientIp(request.headers);
  const ipAddress = trustedIp === "unknown" ? "127.0.0.1" : trustedIp;
  const userAgent = request.headers.get("user-agent") ?? "Simulation Bridge";
  const { token } = await createSession(user.id, ipAddress, userAgent);

  const destination = assessment?.id
    ? `/assessment/${assessment.id}/report`
    : "/dashboard";

  const response = NextResponse.json({ redirectTo: destination });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...getSessionCookieOptions(),
  });

  return response;
}
