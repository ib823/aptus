/** GET: List user's registered passkey credentials */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserCredentials } from "@/lib/auth/webauthn-db";
import { ERROR_CODES } from "@/types/api";

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  const credentials = await getUserCredentials(user.id);

  return NextResponse.json({
    data: credentials.map((c) => ({
      id: c.id,
      credentialId: c.credentialId,
      deviceName: c.deviceName,
      createdAt: c.createdAt.toISOString(),
      lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
      backedUp: c.backedUp,
    })),
  });
}
