/**
 * DELETE: Remove a passkey credential. PATCH: Rename a passkey credential.
 *
 * REMOVING ONE NEEDS A FRESH STEP-UP once COREEDGE_STEP_UP is enforce
 * (lib/auth/step-up.ts, `passkey.remove`). Otherwise a stolen session could
 * delete the person's passkeys and enrol its own as the "first", which needs
 * no step-up. Someone who has lost every passkey asks an administrator to
 * reset their MFA (docs/runbooks/coreedge-step-up.md). Each removal is
 * recorded (lib/auth/passkey-events.ts). Renaming changes nothing the step-up
 * trusts and stays ungated.
 */

import { NextResponse, type NextRequest } from "next/server";
import { recordPasskeyRemoved } from "@/lib/auth/passkey-events";
import { getCurrentUser } from "@/lib/auth/session";
import { requireStepUp, STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up";
import {
  deleteCredential,
  renameCredential,
  getUserCredentialCount,
} from "@/lib/auth/webauthn-db";
import { prisma } from "@/lib/db/prisma";
import { getClientIp } from "@/lib/security/rate-limit";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ credentialId: string }>;
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const { credentialId } = await params;

  const stepUp = await requireStepUp(user, STEP_UP_MAX_AGE_SECONDS, {
    action: "passkey.remove",
    targetId: credentialId,
  });
  if (!stepUp.ok) return stepUp.response;

  const deleted = await deleteCredential(credentialId, user.id);

  if (!deleted) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Credential not found" } },
      { status: 404 },
    );
  }

  // If this was the last credential, clear the mfaEnabled flag
  const remaining = await getUserCredentialCount(user.id);
  if (remaining === 0) {
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaEnabled: false },
    });
  }

  const clientIp = getClientIp(request.headers);
  await recordPasskeyRemoved(user, credentialId, {
    remaining,
    stepUp: stepUp.outcome,
    ipAddress: clientIp === "unknown" ? null : clientIp,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ data: { success: true } });
}

const patchSchema = z.object({
  deviceName: z.string().min(1).max(100),
});

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const body: unknown = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.VALIDATION_ERROR, message: "Invalid device name" } },
      { status: 400 },
    );
  }

  const { credentialId } = await params;
  const updated = await renameCredential(
    credentialId,
    user.id,
    parsed.data.deviceName,
  );

  if (!updated) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.NOT_FOUND, message: "Credential not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: { success: true } });
}
