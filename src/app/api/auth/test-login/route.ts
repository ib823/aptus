/** POST: E2E test login — creates a test user session and sets the cookie.
 *
 * SAFEGUARDS:
 * 1. Only functional when E2E_TEST_SECRET env var is set (never in production)
 * 2. Requires the secret in the request body — can't be exploited without it
 * 3. Uses the real session system — identical auth path to production
 * 4. Creates/reuses a single test user (e2e-tester@abeam.test)
 */

import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db/prisma";
import { createSession, SESSION_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth/session";
import { isIpAllowed, logBackdoorAttempt } from "@/lib/auth/test-backdoor-guards";

const ALLOWED_TEST_DOMAINS = ["abeam.test", "e2e.test"];

const TEST_USER_EMAIL = "e2e-tester@abeam.test";
const TEST_USER_NAME = "E2E Tester";
const TEST_USER_ROLE = "platform_admin";

const ENDPOINT = "/api/auth/test-login";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Gate 0: endpoint must be explicitly enabled
  if (process.env.ENABLE_TEST_LOGIN_ENDPOINT !== "true") {
    return NextResponse.json(
      { error: "Not available" },
      { status: 404 },
    );
  }

  // Gate 1: never available in production unless explicitly opted in
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_LOGIN_IN_PROD !== "true") {
    logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:env", headers: request.headers });
    return NextResponse.json(
      { error: "Not available" },
      { status: 404 },
    );
  }

  const secret = process.env.E2E_TEST_SECRET;

  // Gate 2: endpoint is a no-op unless E2E_TEST_SECRET is configured
  if (!secret) {
    return NextResponse.json(
      { error: "Not available" },
      { status: 404 },
    );
  }

  // Gate 2.5: in production, require a non-trivially-short secret. A short
  // secret in production is a configuration mistake — fail closed instead
  // of letting a 4-char secret protect platform_admin sessions.
  if (process.env.NODE_ENV === "production" && secret.length < 24) {
    logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:env", headers: request.headers });
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  // Gate 2.6: optional IP allow-list (TEST_LOGIN_ALLOWED_IPS, comma-separated).
  // When configured, the source IP must match. Defense in depth so an
  // accidentally-leaked secret can't be used from arbitrary networks.
  if (!isIpAllowed(request.headers, "TEST_LOGIN_ALLOWED_IPS")) {
    logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:ip", headers: request.headers });
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  // Gate 3: caller must provide the correct secret
  let body: { secret?: string; role?: string; email?: string };
  try {
    body = await request.json() as { secret?: string; role?: string; email?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (
    !body.secret ||
    body.secret.length !== secret.length ||
    !timingSafeEqual(Buffer.from(body.secret), Buffer.from(secret))
  ) {
    logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:secret", headers: request.headers });
    return NextResponse.json(
      { error: "Invalid secret" },
      { status: 403 },
    );
  }

  const targetEmail = body.email ?? TEST_USER_EMAIL;

  // Validate email domain against allowlist
  const emailDomain = targetEmail.split("@")[1]?.toLowerCase();
  if (!emailDomain || !ALLOWED_TEST_DOMAINS.includes(emailDomain)) {
    return NextResponse.json(
      { error: "Email domain not allowed for test login" },
      { status: 400 },
    );
  }
  // Optional: allow specifying a role for the test user
  const role = body.role ?? TEST_USER_ROLE;

  // Upsert the test user
  let user = await prisma.user.findUnique({
    where: { email: targetEmail },
    select: { id: true, role: true },
  });

  if (!user) {
    // Find or create a test organization
    let org = await prisma.organization.findFirst({
      where: { slug: "e2e-test-org" },
      select: { id: true },
    });

    if (!org) {
      org = await prisma.organization.create({
        data: {
          name: "E2E Test Organization",
          slug: "e2e-test-org",
          type: "partner",
          plan: "ENTERPRISE",
          subscriptionStatus: "ACTIVE",
        },
      });
    }

    user = await prisma.user.create({
      data: {
        email: targetEmail,
        name: TEST_USER_NAME,
        role,
        organizationId: org.id,
        isActive: true,
        emailVerified: new Date(),
      },
      select: { id: true, role: true },
    });
  } else if (user.role !== role) {
    // Update role if requested differently
    await prisma.user.update({
      where: { email: targetEmail },
      data: { role },
    });
  }

  // Auto-complete onboarding so the guard doesn't redirect
  const existingProgress = await prisma.onboardingProgress.findUnique({
    where: { userId: user.id },
  });

  if (!existingProgress) {
    await prisma.onboardingProgress.create({
      data: {
        userId: user.id,
        role,
        currentStep: 0,
        completedSteps: [],
        skippedSteps: [],
        isComplete: true,
      },
    });
  }

  // Create a real session (same path as production login)
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent") ?? null;
  const { token } = await createSession(user.id, ipAddress, userAgent);

  // Set the session cookie
  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, email: targetEmail, role },
    message: "Test session created. You are now authenticated.",
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...getSessionCookieOptions(),
  });

  logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "success", headers: request.headers, email: targetEmail });

  return response;
}
