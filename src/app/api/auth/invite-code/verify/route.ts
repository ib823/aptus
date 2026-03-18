/** POST: Verify 6-digit invite code and create session */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createSession, SESSION_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth/session";
import { ERROR_CODES } from "@/types/api";
import { safeParseJsonBody } from "@/lib/http/safe-json-body";
import { z } from "zod";

const verifySchema = z.object({
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  code: z.string().trim().min(6).max(6),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const bodyResult = await safeParseJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const parsed = verifySchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Enter a valid email and 6-digit code" } },
      { status: 400 },
    );
  }

  const { email, code } = parsed.data;

  // Find matching pending code
  const invite = await prisma.inviteCode.findFirst({
    where: {
      email,
      code,
      status: "pending",
    },
  });

  if (!invite) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Invalid code. Check and try again." } },
      { status: 401 },
    );
  }

  // Check expiry
  if (invite.expiresAt < new Date()) {
    // Mark as expired
    await prisma.inviteCode.update({
      where: { id: invite.id },
      data: { status: "expired" },
    });
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Code expired. Contact your administrator for a new one." } },
      { status: 401 },
    );
  }

  // Find or verify the user exists
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, isActive: true },
  });

  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "No account found for this email." } },
      { status: 401 },
    );
  }

  if (!user.isActive) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Account is deactivated. Contact your administrator." } },
      { status: 401 },
    );
  }

  // Mark code as used
  await prisma.inviteCode.update({
    where: { id: invite.id },
    data: { status: "used", usedAt: new Date() },
  });

  // Update user login stats
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: new Date(),
      lastLoginAt: new Date(),
      loginCount: { increment: 1 },
    },
  });

  // Create session
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor
    ? (forwardedFor.split(",")[0]?.trim() ?? null)
    : (request.headers.get("x-real-ip") ?? null);
  const userAgent = request.headers.get("user-agent") ?? null;
  const { token } = await createSession(user.id, ipAddress, userAgent);

  // Set session cookie and return
  const response = NextResponse.json({
    data: { success: true, redirectUrl: "/assessments" },
  });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    ...getSessionCookieOptions(),
  });

  return response;
}
