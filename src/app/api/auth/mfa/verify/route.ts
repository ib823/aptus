/** POST: Verify TOTP code for session MFA */

import { NextResponse, type NextRequest } from "next/server";
import { getSessionToken, getCurrentUser, markSessionMfaVerified } from "@/lib/auth/session";
import { verifyTotpCode } from "@/lib/auth/mfa";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { APP_CONFIG } from "@/constants/config";
import { checkRateLimit, RATE_LIMITS, getClientIp } from "@/lib/security/rate-limit";
import { z } from "zod";

const verifySchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  // IP-based rate limiting
  const clientIp = getClientIp(request.headers);
  const rateCheck = checkRateLimit(`mfa:${clientIp}`, RATE_LIMITS.mfa);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.RATE_LIMITED, message: "Too many attempts. Please try again later." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.resetMs / 1000)) } },
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const body: unknown = await request.json();
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid code format" } },
      { status: 400 },
    );
  }

  // Get the user's encrypted TOTP secret
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { totpSecret: true, totpVerified: true },
  });

  if (!dbUser?.totpSecret || !dbUser.totpVerified) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.MFA_SETUP_REQUIRED, message: "MFA setup is required" } },
      { status: 403 },
    );
  }

  // Check rate limit via MfaChallenge
  const recentChallenges = await prisma.mfaChallenge.findMany({
    where: {
      userId: user.id,
      challengeType: "totp_verify",
      completedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  let challenge = recentChallenges[0];

  if (!challenge) {
    // Create a new challenge
    challenge = await prisma.mfaChallenge.create({
      data: {
        userId: user.id,
        challengeType: "totp_verify",
        expiresAt: new Date(Date.now() + APP_CONFIG.mfaChallengeExpiryMinutes * 60 * 1000),
        ipAddress: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
      },
    });
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.RATE_LIMITED, message: "Too many attempts. Please try again later." } },
      { status: 429 },
    );
  }

  // Verify the code
  const isValid = verifyTotpCode(dbUser.totpSecret, parsed.data.code);

  if (!isValid) {
    // Increment attempt counter
    await prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });

    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: "Invalid verification code",
        },
      },
      { status: 400 },
    );
  }

  // Mark challenge as completed
  await prisma.mfaChallenge.update({
    where: { id: challenge.id },
    data: { completedAt: new Date() },
  });

  // Mark session as MFA-verified
  const token = await getSessionToken();
  if (token) {
    await markSessionMfaVerified(token);
  }

  return NextResponse.json({
    data: { success: true, mfaVerified: true },
  });
}
