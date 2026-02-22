/** POST: Initiate TOTP setup — generates secret and returns QR URI */
/** GET: Get current MFA setup state */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { generateTotpSecret, encryptTotpSecret, verifyTotpCode } from "@/lib/auth/mfa";
import { prisma } from "@/lib/db/prisma";
import { logDecision } from "@/lib/audit/decision-logger";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

const verifySchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/),
  secret: z.string().min(1),
});

export const preferredRegion = "sin1";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  // Generate a new TOTP secret
  const { secret, uri } = generateTotpSecret(user.email);

  return NextResponse.json({
    data: {
      secret,
      uri,
      alreadySetup: user.totpVerified,
    },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  const { code, secret } = parsed.data;

  // Encrypt the secret and verify the code against it
  const encrypted = encryptTotpSecret(secret);

  if (!verifyTotpCode(encrypted, code)) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid verification code" } },
      { status: 400 },
    );
  }

  // Store the encrypted secret and mark MFA as enabled
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpSecret: encrypted,
      totpVerified: true,
      totpVerifiedAt: new Date(),
      mfaEnabled: true,
      mfaMethod: "totp",
    },
  });

  // Find the user's first assessment (if any) for decision logging
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
      newValue: { method: "totp" },
      actor: user.email,
      actorRole: user.role,
    });
  }

  return NextResponse.json({
    data: { success: true },
  });
}
