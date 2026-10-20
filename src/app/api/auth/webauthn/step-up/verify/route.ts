/**
 * POST: finish a passkey step-up, and stamp it on THIS session.
 *
 * WHY NOT REUSE /authenticate/verify. That route is a sign-in: it resolves the
 * user from whichever credential answered and MINTS A NEW SESSION for them,
 * displacing others past the organization's limit and sending a "new sign-in"
 * email. A step-up is none of that. The person is already signed in; they are
 * proving, now, that they still hold their passkey, so the existing session is
 * the one that records it (`Session.passkeyAssertedAt`), and the governance
 * routes read it from there (lib/auth/step-up.ts).
 *
 * THE CREDENTIAL MUST BE THE SESSION USER'S OWN. The options route offers only
 * their passkeys, but the browser's answer is input: an assertion from someone
 * else's passkey would be a perfectly valid signature by the wrong person, and
 * stamping it on this session would let one person's touch authorise another
 * person's approval. So the owner is checked before the signature is.
 *
 * THE CHALLENGE COUNTS ONCE, ON THIS SESSION. The signed cookie proves the
 * server issued it and when, but it is stateless: deleting it after reading is
 * only a request to the browser, and a captured cookie and body would verify
 * again, on any session of the same person, until the cookie expired. So the
 * options route also records the challenge on the session, and the write that
 * stamps the assertion clears it (`recordStepUpAssertion`). A replay, and a
 * challenge issued to another session, find nothing to consume. The purpose
 * is signed into the cookie as well (lib/auth/webauthn.ts): a sign-in
 * challenge is refused here, and a captured step-up is refused by the sign-in
 * route, which would otherwise mint a new session that counts as stepped up —
 * that route spends each of its own challenges once (`consumeSignInChallenge`).
 *
 * THE TOKEN IS ROTATED afterwards, as `rotateSessionToken` asks of every
 * privilege change: the session now carries more authority than it did, and a
 * copy of the old cookie should not inherit it.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  getSessionCookieOptions,
  getSessionToken,
  recordStepUpAssertion,
  rotateSessionToken,
  SESSION_COOKIE_NAME,
  validateSession,
} from "@/lib/auth/session";
import { STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up-codes";
import { getChallengeFromCookie, verifyAuthenticationResponse } from "@/lib/auth/webauthn";
import { getCredentialByCredentialId, updateCredentialCounter } from "@/lib/auth/webauthn-db";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/security/rate-limit";
import { ERROR_CODES } from "@/types/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  response: z.record(z.string(), z.unknown()),
});

function failed(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: { code: ERROR_CODES.VALIDATION_ERROR, message } }, { status });
}

function tooMany(resetMs: number): NextResponse {
  return NextResponse.json(
    { error: { code: ERROR_CODES.RATE_LIMITED, message: "Too many attempts. Please try again later." } },
    { status: 429, headers: { "Retry-After": String(Math.ceil(resetMs / 1000)) } },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // A loose per-IP backstop first; the real limit is per person, below, so
  // approvers sharing an office egress address do not spend each other's
  // attempts (see the options route).
  const ipCheck = await checkRateLimit(
    `webauthn-step-up-verify:ip:${getClientIp(request.headers)}`,
    RATE_LIMITS.stepUpPerIp,
  );
  if (!ipCheck.allowed) return tooMany(ipCheck.resetMs);

  const token = await getSessionToken();
  const user = token ? await validateSession(token) : null;
  if (!token || !user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Sign in first." } },
      { status: 401 },
    );
  }

  const userCheck = await checkRateLimit(`webauthn-step-up-verify:user:${user.id}`, RATE_LIMITS.mfa);
  if (!userCheck.allowed) return tooMany(userCheck.resetMs);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failed("Invalid request body");

  // The cookie says the server issued this challenge, recently; whether it
  // is still this session's to use is settled when it is consumed, below.
  const expectedChallenge = await getChallengeFromCookie("stepup");
  if (!expectedChallenge) return failed("Challenge expired or missing");

  const answer = parsed.data.response as { id?: unknown; rawId?: unknown };
  const credentialId = typeof answer.id === "string" ? answer.id : answer.rawId;
  if (typeof credentialId !== "string" || credentialId.length === 0) {
    return failed("Missing credential ID");
  }

  const credential = await getCredentialByCredentialId(credentialId);
  // The same words for "no such passkey" and "someone else's passkey": the
  // difference would tell a caller which credential ids exist.
  if (!credential || credential.userId !== user.id) {
    return failed("That passkey is not registered to your account.", 403);
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
    if (!verification.verified) return failed("Passkey verification failed");

    await updateCredentialCounter(credential.credentialId, verification.authenticationInfo.newCounter);
  } catch {
    return failed("Passkey verification failed");
  }

  const assertedAt = await recordStepUpAssertion(token, expectedChallenge);
  if (!assertedAt) return failed("That passkey check has already been used or has expired. Try again.");
  const rotated = await rotateSessionToken(token);

  const response = NextResponse.json({
    data: {
      assertedAt: assertedAt.toISOString(),
      // How long it counts for, so the console can say so.
      validForSeconds: STEP_UP_MAX_AGE_SECONDS,
    },
  });
  if (rotated) response.cookies.set(SESSION_COOKIE_NAME, rotated, getSessionCookieOptions());
  return response;
}
