/** POST: Generate WebAuthn authentication options (public — unauthenticated) */

import { createHmac } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationChallenge } from "@/lib/auth/webauthn";
import { getUserCredentials } from "@/lib/auth/webauthn-db";
import { prisma } from "@/lib/db/prisma";
import { ERROR_CODES } from "@/types/api";
import { checkRateLimit, RATE_LIMITS, getClientIp } from "@/lib/security/rate-limit";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email().optional(),
});

/**
 * Deterministic decoy credential descriptor for an email that has no real
 * passkey. Keyed by NEXTAUTH_SECRET so it is stable per email (like a real
 * user's credential list) but unforgeable and unlinkable to any account. Its
 * only purpose is to make the options response for an unknown / passkey-less
 * email indistinguishable in shape from a real one — closing the "does this
 * email have a passkey" enumeration oracle. Authentication with a decoy always
 * fails at the verify step (no authenticator holds it).
 */
function decoyCredentials(
  email: string,
): { credentialId: string; transports: string[] }[] {
  const secret = process.env.NEXTAUTH_SECRET ?? "webauthn-decoy-dev-secret";
  const digest = createHmac("sha256", secret)
    .update(`webauthn-decoy:${email.toLowerCase()}`)
    .digest();
  return [{ credentialId: digest.toString("base64url"), transports: ["internal"] }];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request.headers);
  const rateCheck = await checkRateLimit(`webauthn-auth:${clientIp}`, RATE_LIMITS.auth);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.RATE_LIMITED, message: "Too many attempts. Please try again later." } },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.resetMs / 1000)) } },
    );
  }

  let allowCredentials: { credentialId: string; transports: string[] }[] | undefined;

  // Parse optional email from body
  const body: unknown = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (parsed.success && parsed.data.email) {
    const email = parsed.data.email;
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });

    let realCredentials: { credentialId: string; transports: string[] }[] | undefined;
    if (user?.isActive) {
      const credentials = await getUserCredentials(user.id);
      if (credentials.length > 0) {
        realCredentials = credentials.map((c) => ({
          credentialId: c.credentialId,
          transports: c.transports,
        }));
      }
    }

    // Always return a populated allowCredentials for a provided email — real
    // descriptors when the account has passkeys, deterministic decoys otherwise
    // — so the response never discloses whether the email has a passkey.
    allowCredentials = realCredentials ?? decoyCredentials(email);
  }
  // No email provided → usernameless / discoverable-credential flow: leave
  // allowCredentials empty. There is no email to enumerate in this path.

  const { options } = await generateAuthenticationChallenge(allowCredentials);

  return NextResponse.json({ data: options });
}
