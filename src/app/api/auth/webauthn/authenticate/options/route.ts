/** POST: Generate WebAuthn authentication options (public — unauthenticated) */

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const clientIp = getClientIp(request.headers);
  const rateCheck = checkRateLimit(`webauthn-auth:${clientIp}`, RATE_LIMITS.auth);
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
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, isActive: true },
    });

    if (user?.isActive) {
      const credentials = await getUserCredentials(user.id);
      if (credentials.length > 0) {
        allowCredentials = credentials.map((c) => ({
          credentialId: c.credentialId,
          transports: c.transports,
        }));
      }
    }
  }

  const { options } = await generateAuthenticationChallenge(allowCredentials);

  return NextResponse.json({ data: options });
}
