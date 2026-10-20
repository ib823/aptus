/**
 * GET: Generate WebAuthn registration options for authenticated user.
 *
 * A PASSKEY BESIDE AN EXISTING ONE NEEDS A FRESH STEP-UP once
 * COREEDGE_STEP_UP is enforce (lib/auth/step-up.ts, `passkey.add`): otherwise
 * a stolen session could add its own authenticator and then step up with it.
 * Asked here so the console prompts before the browser's registration dialog,
 * not after it; the verify route asks again, because a challenge can be had
 * elsewhere. Checked only, not recorded — the verify route records the one
 * enrolment once. A first passkey is trust on first use (lib/auth/passkey-events.ts).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { checkStepUp, STEP_UP_MAX_AGE_SECONDS } from "@/lib/auth/step-up";
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

  if (user.hasWebAuthn) {
    const stepUp = checkStepUp(user, STEP_UP_MAX_AGE_SECONDS, { action: "passkey.add" });
    if (!stepUp.ok) return stepUp.response;
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
