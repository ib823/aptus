/** DELETE: Remove a passkey credential. PATCH: Rename a passkey credential. */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  deleteCredential,
  renameCredential,
  getUserCredentialCount,
} from "@/lib/auth/webauthn-db";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ credentialId: string }>;
}

export async function DELETE(
  _request: NextRequest,
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
