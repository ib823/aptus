/** POST: Verify WebAuthn authentication response and create session */

import { NextResponse, type NextRequest } from "next/server";
import {
  verifyAuthenticationResponse,
  getChallengeFromCookie,
} from "@/lib/auth/webauthn";
import {
  getCredentialByCredentialId,
  updateCredentialCounter,
  getUserByCredentialId,
} from "@/lib/auth/webauthn-db";
import {
  createSession,
  markSessionMfaVerified,
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
} from "@/lib/auth/session";
import { notifyNewLogin, notifySessionDisplaced } from "@/lib/auth/login-notify";
import { ERROR_CODES } from "@/types/api";
import { checkRateLimit, RATE_LIMITS, getClientIp } from "@/lib/security/rate-limit";
import { z } from "zod";

const bodySchema = z.object({
  response: z.record(z.string(), z.unknown()),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request.headers);
  const rateCheck = await checkRateLimit(`webauthn-verify:${clientIp}`, RATE_LIMITS.mfa);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.RATE_LIMITED, message: "Too many attempts. Please try again later." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.resetMs / 1000)) } },
    );
  }

  const body: unknown = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid request body" } },
      { status: 400 },
    );
  }

  const expectedChallenge = await getChallengeFromCookie();
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Challenge expired or missing" } },
      { status: 400 },
    );
  }

  // Extract credential ID from the response
  const authResponse = parsed.data.response as { id?: string; rawId?: string };
  const credentialId = authResponse.id ?? authResponse.rawId;
  if (!credentialId || typeof credentialId !== "string") {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Missing credential ID" } },
      { status: 400 },
    );
  }

  // Look up the credential
  const credential = await getCredentialByCredentialId(credentialId);
  if (!credential) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Unknown credential" } },
      { status: 400 },
    );
  }

  // Look up the user
  const user = await getUserByCredentialId(credentialId);
  if (!user || !user.isActive) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Account inactive" } },
      { status: 401 },
    );
  }

  try {
    const verification = await verifyAuthenticationResponse(
      parsed.data.response as unknown as Parameters<typeof verifyAuthenticationResponse>[0],
      expectedChallenge,
      {
        credentialId: credential.credentialId,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports,
      },
    );

    if (!verification.verified) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Authentication verification failed" } },
        { status: 400 },
      );
    }

    // Update credential counter
    await updateCredentialCounter(
      credential.credentialId,
      verification.authenticationInfo.newCounter,
    );

    // Create session (same as bridge route)
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor
      ? (forwardedFor.split(",")[0]?.trim() ?? null)
      : (request.headers.get("x-real-ip") ?? null);
    const userAgent = request.headers.get("user-agent") ?? null;
    const { token, hadExistingSession } = await createSession(user.id, ipAddress, userAgent);

    // Fire-and-forget login notifications
    notifyNewLogin({ userId: user.id, ipAddress, userAgent, loginMethod: "passkey" });
    if (hadExistingSession) {
      notifySessionDisplaced({ userId: user.id, newIpAddress: ipAddress, newUserAgent: userAgent });
    }

    // Passkey satisfies MFA — mark session as verified immediately
    await markSessionMfaVerified(token);

    // Set session cookie and return success
    const response = NextResponse.json({
      data: { success: true, redirectUrl: "/assessments" },
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      ...getSessionCookieOptions(),
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Authentication verification failed" } },
      { status: 400 },
    );
  }
}
