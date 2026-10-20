/**
 * POST: start a passkey step-up for the signed-in person.
 *
 * NOT THE SIGN-IN CEREMONY. /authenticate/options is public and answers any
 * email, with decoy credentials so it cannot be used to learn who has a
 * passkey. This one is for someone already signed in who is about to take a
 * governance action (lib/auth/step-up.ts): it needs the session, and it offers
 * ONLY that person's own passkeys, so the assertion that comes back can only be
 * theirs. There is nothing to enumerate — the caller already knows who they are.
 *
 * NO PASSKEY IS ANSWERED WITH THE ENROLMENT CODE, not with an empty challenge:
 * the console turns it into "add a passkey" rather than a browser prompt that
 * can never succeed.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { STEP_UP_CODES } from "@/lib/auth/step-up-codes";
import { generateAuthenticationChallenge } from "@/lib/auth/webauthn";
import { getUserCredentials } from "@/lib/auth/webauthn-db";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/security/rate-limit";
import { ERROR_CODES } from "@/types/api";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rateCheck = await checkRateLimit(`webauthn-step-up:${getClientIp(request.headers)}`, RATE_LIMITS.auth);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.RATE_LIMITED, message: "Too many attempts. Please try again later." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.resetMs / 1000)) } },
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Sign in first." } },
      { status: 401 },
    );
  }

  const credentials = await getUserCredentials(user.id);
  if (credentials.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: STEP_UP_CODES.enrolmentRequired,
          message: "Your account has no passkey yet. Add one under Settings → Security first.",
        },
      },
      { status: 409 },
    );
  }

  const { options } = await generateAuthenticationChallenge(
    credentials.map((c) => ({ credentialId: c.credentialId, transports: c.transports })),
  );

  return NextResponse.json({ data: options });
}
