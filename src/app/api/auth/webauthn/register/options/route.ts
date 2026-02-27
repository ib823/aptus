/** GET: Generate WebAuthn registration options for authenticated user */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { generateRegistrationChallenge } from "@/lib/auth/webauthn";
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

  const existingCredentials = await getUserCredentials(user.id);

  const { options } = await generateRegistrationChallenge(
    { id: user.id, email: user.email, name: user.name },
    existingCredentials.map((c) => ({
      credentialId: c.credentialId,
      transports: c.transports,
    })),
  );

  return NextResponse.json({ data: options });
}
