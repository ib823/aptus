/**
 * POST: Verify WebAuthn registration response and store credential.
 *
 * REGISTERING IS NOT ASSERTING. It proves only that the caller holds the
 * session, which a stolen cookie also does, so it never stamps the session as
 * stepped up (lib/auth/session.ts `markSessionMfaVerified`); the step-up
 * dialog follows an enrolment with a real assertion.
 *
 * A PASSKEY BESIDE AN EXISTING ONE NEEDS A FRESH STEP-UP from one the person
 * already has (lib/auth/step-up.ts, `passkey.add`), asked before the challenge
 * is read: a stolen session must not add the authenticator it would then step
 * up with. A first passkey has nothing to assert with and is trust on first
 * use. Either way it is recorded and the person is emailed
 * (lib/auth/passkey-events.ts), so an enrolment they did not make is seen.
 */

import { NextResponse, type NextRequest } from "next/server";
import { recordPasskeyAdded } from "@/lib/auth/passkey-events";
import { getCurrentUser, getSessionToken, markSessionMfaVerified, rotateSessionToken, SESSION_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth/session";
import { requireStepUp, STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up";
import { verifyRegistrationResponse, getChallengeFromCookie } from "@/lib/auth/webauthn";
import { saveCredential } from "@/lib/auth/webauthn-db";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { getClientIp } from "@/lib/security/rate-limit";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const bodySchema = z.object({
  response: z.record(z.string(), z.unknown()),
  deviceName: z.string().max(100).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
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

  const firstPasskey = !user.hasWebAuthn;
  let stepUpOutcome = "first_passkey";
  if (!firstPasskey) {
    const stepUp = await requireStepUp(user, STEP_UP_MAX_AGE_SECONDS, { action: "passkey.add" });
    if (!stepUp.ok) return stepUp.response;
    stepUpOutcome = stepUp.outcome;
  }

  const expectedChallenge = await getChallengeFromCookie();
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Challenge expired or missing" } },
      { status: 400 },
    );
  }

  try {
    const verification = await verifyRegistrationResponse(
      parsed.data.response as unknown as Parameters<typeof verifyRegistrationResponse>[0],
      expectedChallenge,
    );

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Registration verification failed" } },
        { status: 400 },
      );
    }

    const credential = await saveCredential(
      user.id,
      verification.registrationInfo,
      parsed.data.deviceName,
    );

    const clientIp = getClientIp(request.headers);
    await recordPasskeyAdded(
      user,
      { credentialId: credential.credentialId, deviceName: credential.deviceName },
      {
        firstPasskey,
        stepUp: stepUpOutcome,
        ipAddress: clientIp === "unknown" ? null : clientIp,
        userAgent: request.headers.get("user-agent"),
      },
    );

    // Mark user as MFA-enabled (passkey is the only second factor)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
      },
    });

    // Log MFA enrollment decision
    const stakeholder = await prisma.assessmentStakeholder.findFirst({
      where: { userId: user.id },
      select: { assessmentId: true },
    });

    if (stakeholder) {
      await logDecision({
        assessmentId: stakeholder.assessmentId,
        entityType: "user",
        entityId: user.id,
        action: "MFA_ENROLLED",
        newValue: { method: "webauthn", credentialId: credential.credentialId },
        actor: user.email,
        actorRole: user.role,
      });
    }

    // Passkey registration satisfies MFA — mark session as verified. Not as
    // stepped up: see the header.
    const token = await getSessionToken();
    if (token) {
      await markSessionMfaVerified(token);
      const newToken = await rotateSessionToken(token);
      if (newToken) {
        const response = NextResponse.json({
          data: { success: true, credentialId: credential.credentialId },
        });
        response.cookies.set(SESSION_COOKIE_NAME, newToken, {
          ...getSessionCookieOptions(),
        });
        return response;
      }
    }

    return NextResponse.json({
      data: { success: true, credentialId: credential.credentialId },
    });
  } catch {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Registration verification failed" } },
      { status: 400 },
    );
  }
}
