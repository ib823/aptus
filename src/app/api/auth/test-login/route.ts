/** POST: E2E test login — creates a test user session and sets the cookie.
 *
 * NOT IN A PRODUCTION BUILD AT ALL, AND THAT IS THE FIRST SAFEGUARD.
 * scripts/strip-test-auth-for-production.mjs deletes this directory from the
 * build workspace on a customer-facing Vercel deploy, before `next build` runs:
 * the path 404s from the router and no environment variable can bring it back.
 * Everything below protects a Preview deployment, which keeps the file.
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
import { getClientIp } from "@/lib/security/client-ip";
import { createSession, SESSION_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth/session";
import {
  isIpAllowed,
  logBackdoorAttempt,
  productionBackdoorBlock,
  recordBackdoorSuccess,
} from "@/lib/auth/test-backdoor-guards";
import { ALL_USER_ROLES, type UserRole } from "@/types/assessment";

const ALLOWED_TEST_DOMAINS = ["abeam.test", "e2e.test"];

const TEST_USER_EMAIL = "e2e-tester@abeam.test";
const TEST_USER_NAME = "E2E Tester";
const TEST_USER_ROLE = "platform_admin";

const ENDPOINT = "/api/auth/test-login";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Gate 0: endpoint must be explicitly enabled.
  //
  // The refusal is RECORDED. This returned 404 silently, so a caller probing a
  // production deploy for this endpoint left no trace at all — and the trail
  // exists precisely to show that somebody went looking. `denied:disabled` is
  // the outcome the guard module has always declared for this case.
  if (process.env.ENABLE_TEST_LOGIN_ENDPOINT !== "true") {
    await logBackdoorAttempt({
      endpoint: ENDPOINT,
      outcome: "denied:disabled",
      headers: request.headers,
    });
    return NextResponse.json(
      { error: "Not available" },
      { status: 404 },
    );
  }

  /*
   * Gate 1: production.
   *
   * TWO CONDITIONS NOW, NOT ONE. `ALLOW_TEST_LOGIN_IN_PROD` was the whole gate,
   * and it is a variable an operator can set in a dashboard after the build —
   * which is exactly the case `scripts/strip-test-auth-for-production.mjs` warns
   * about in its own header ("set deliberately for an internal test deploy and
   * never unset"). `check-production-env.js` has always demanded a SECOND,
   * deliberate signal before it will let such a deploy build at all; the runtime
   * now demands the same one, so the build-time contract and the runtime
   * contract cannot disagree.
   */
  const productionBlock = productionBackdoorBlock();
  if (productionBlock) {
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:env", headers: request.headers });
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_LOGIN_IN_PROD !== "true") {
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:env", headers: request.headers });
    return NextResponse.json(
      { error: "Not available" },
      { status: 404 },
    );
  }

  const secret = process.env.E2E_TEST_SECRET;

  // Gate 2: endpoint is a no-op unless E2E_TEST_SECRET is configured.
  // Recorded for the same reason as gate 0 — enabled but unconfigured is a
  // state somebody can probe, and an unrecorded refusal is a blind spot.
  if (!secret) {
    await logBackdoorAttempt({
      endpoint: ENDPOINT,
      outcome: "denied:disabled",
      headers: request.headers,
    });
    return NextResponse.json(
      { error: "Not available" },
      { status: 404 },
    );
  }

  // Gate 2.5: in production, require a non-trivially-short secret. A short
  // secret in production is a configuration mistake — fail closed instead
  // of letting a 4-char secret protect platform_admin sessions.
  if (process.env.NODE_ENV === "production" && secret.length < 24) {
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:env", headers: request.headers });
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  // Gate 2.6: optional IP allow-list (TEST_LOGIN_ALLOWED_IPS, comma-separated).
  // When configured, the source IP must match. Defense in depth so an
  // accidentally-leaked secret can't be used from arbitrary networks.
  if (!isIpAllowed(request.headers, "TEST_LOGIN_ALLOWED_IPS")) {
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:ip", headers: request.headers });
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
    await logBackdoorAttempt({ endpoint: ENDPOINT, outcome: "denied:secret", headers: request.headers });
    return NextResponse.json(
      { error: "Invalid secret" },
      { status: 403 },
    );
  }

  const targetEmail = body.email ?? TEST_USER_EMAIL;

  // Validate email domain against allowlist
  const emailDomain = targetEmail.split("@")[1]?.toLowerCase();
  if (!emailDomain || !ALLOWED_TEST_DOMAINS.includes(emailDomain)) {
    await logBackdoorAttempt({
      endpoint: ENDPOINT,
      outcome: "denied:user",
      headers: request.headers,
      email: targetEmail,
    });
    return NextResponse.json(
      { error: "Email domain not allowed for test login" },
      { status: 400 },
    );
  }
  /*
   * Optional: allow specifying a role for the test user.
   *
   * VALIDATED AGAINST THE REAL VOCABULARY. `body.role ?? TEST_USER_ROLE` went
   * straight into `User.role`, so the secret holder could write any string at
   * all — and a role nobody's permission table knows is not a harmless typo:
   * every `role === "consultant"` check fails, every hierarchy comparison reads
   * undefined, and the resulting session is one no screen in the product can
   * reason about. A test fixture shaped unlike real data tests the wrong thing.
   */
  const requestedRole = body.role ?? TEST_USER_ROLE;
  if (!(ALL_USER_ROLES as readonly string[]).includes(requestedRole)) {
    await logBackdoorAttempt({
      endpoint: ENDPOINT,
      outcome: "denied:role",
      headers: request.headers,
      email: targetEmail,
    });
    return NextResponse.json(
      { error: `Unknown role. Use one of: ${ALL_USER_ROLES.join(", ")}` },
      { status: 400 },
    );
  }
  const role = requestedRole as UserRole;

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
          // Both columns, canonical, same as every other creation path — a test
          // fixture that is shaped differently from real data tests the wrong
          // thing.
          type: "partner",
          orgType: "partner",
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

  /*
   * RECORD BEFORE MINTING, AND REFUSE IF IT CANNOT BE RECORDED.
   *
   * Everywhere else in this codebase an audit failure is deliberately non-fatal:
   * "losing the caller's data because the audit row failed would be a worse
   * outcome than a visible gap in the trail" (northbound/audit.ts). That
   * reasoning inverts here, because the caller's data IS a platform_admin session
   * obtained without credentials. A gap in the trail is the worse outcome, so a
   * session that cannot be written down is not issued.
   */
  const recorded = await recordBackdoorSuccess({
    endpoint: ENDPOINT,
    headers: request.headers,
    email: targetEmail,
    userId: user.id,
  });
  if (!recorded) {
    return NextResponse.json(
      { error: "Test login is unavailable: the attempt could not be audited." },
      { status: 503 },
    );
  }

  // Create a real session (same path as production login)
  const trustedIp = getClientIp(request.headers);
  const ipAddress = trustedIp === "unknown" ? null : trustedIp;
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

  return response;
}
