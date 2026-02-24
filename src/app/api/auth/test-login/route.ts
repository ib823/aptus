/** POST: E2E test login — creates a test user session and sets the cookie.
 *
 * SAFEGUARDS:
 * 1. Only functional when E2E_TEST_SECRET env var is set (never in production)
 * 2. Requires the secret in the request body — can't be exploited without it
 * 3. Uses the real session system — identical auth path to production
 * 4. Creates/reuses a single test user (e2e-tester@aptus.test)
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { APP_CONFIG } from "@/constants/config";

const TEST_USER_EMAIL = "e2e-tester@aptus.test";
const TEST_USER_NAME = "E2E Tester";
const TEST_USER_ROLE = "platform_admin";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Gate 0: never available in production unless explicitly opted in
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_TEST_LOGIN) {
    return NextResponse.json(
      { error: "Not available" },
      { status: 404 },
    );
  }

  const secret = process.env.E2E_TEST_SECRET;

  // Gate 1: endpoint is a no-op unless E2E_TEST_SECRET is configured
  if (!secret) {
    return NextResponse.json(
      { error: "Not available" },
      { status: 404 },
    );
  }

  // Gate 2: caller must provide the correct secret
  let body: { secret?: string; role?: string };
  try {
    body = await request.json() as { secret?: string; role?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (body.secret !== secret) {
    return NextResponse.json(
      { error: "Invalid secret" },
      { status: 403 },
    );
  }

  // Optional: allow specifying a role for the test user
  const role = body.role ?? TEST_USER_ROLE;

  // Upsert the test user
  let user = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
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
        email: TEST_USER_EMAIL,
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
      where: { email: TEST_USER_EMAIL },
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
  const token = await createSession(user.id, ipAddress, userAgent);

  // Set the session cookie
  const response = NextResponse.json({
    ok: true,
    user: { id: user.id, email: TEST_USER_EMAIL, role },
    message: "Test session created. You are now authenticated.",
  });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: APP_CONFIG.sessionMaxAgeHours * 60 * 60,
  });

  return response;
}
