/** POST: Verify WebAuthn registration response and store credential */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyRegistrationResponse, getChallengeFromCookie } from "@/lib/auth/webauthn";
import { saveCredential } from "@/lib/auth/webauthn-db";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
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

    // Update user MFA status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: true,
        mfaMethod: "webauthn",
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
