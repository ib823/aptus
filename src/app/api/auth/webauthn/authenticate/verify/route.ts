/**
 * POST: Verify WebAuthn authentication response and create session.
 *
 * THE SESSION IT MINTS COUNTS AS STEPPED UP (`markSessionPasskeyAsserted`), so
 * this route must not accept anything a step-up would refuse. The challenge
 * must have been issued for a SIGN-IN (the purpose is signed into the cookie):
 * a captured step-up replayed here finds no sign-in challenge. And it counts
 * once (`consumeSignInChallenge`): the cookie is stateless, so without the
 * server-side record a captured sign-in would mint a fresh session for the
 * person, assertion and all, until the cookie expired.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  verifyAuthenticationResponse,
  getChallengeFromCookie,
  CHALLENGE_TTL_SECONDS,
} from "@/lib/auth/webauthn";
import {
  consumeSignInChallenge,
  getCredentialByCredentialId,
  updateCredentialCounter,
  getUserByCredentialId,
} from "@/lib/auth/webauthn-db";
import {
  createSession,
  markSessionPasskeyAsserted,
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

  const expectedChallenge = await getChallengeFromCookie("signin");
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

    // A genuine assertion, so spend the challenge: a second use of it is a
    // replay, refused before anything is minted.
    if (!(await consumeSignInChallenge(expectedChallenge, CHALLENGE_TTL_SECONDS))) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Challenge expired or missing" } },
        { status: 400 },
      );
    }

    // Update credential counter
    await updateCredentialCounter(
      credential.credentialId,
      verification.authenticationInfo.newCounter,
    );

    // Create session (same as bridge route) — IP via the trusted extraction,
    // never the spoofable leftmost XFF hop.
    const clientIp = getClientIp(request.headers);
    const ipAddress = clientIp === "unknown" ? null : clientIp;
    const userAgent = request.headers.get("user-agent") ?? null;
    const { token, hadExistingSession } = await createSession(user.id, ipAddress, userAgent);

    // Fire-and-forget login notifications
    notifyNewLogin({ userId: user.id, ipAddress, userAgent, loginMethod: "passkey" });
    if (hadExistingSession) {
      notifySessionDisplaced({ userId: user.id, newIpAddress: ipAddress, newUserAgent: userAgent });
    }

    // Passkey satisfies MFA, and this sign-in IS an assertion: the session is
    // verified and counts as stepped up for the next few minutes.
    await markSessionPasskeyAsserted(token);

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
