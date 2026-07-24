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

type CredentialDescriptor = { credentialId: string; transports: string[] };

/**
 * Deterministic decoy credential descriptors for an email that has no real
 * passkey. Keyed by NEXTAUTH_SECRET so they are stable per email (like a real
 * user's credential list) but unforgeable and unlinkable to any account. Their
 * only purpose is to make the options response for an unknown / passkey-less
 * email indistinguishable in shape from a real one — closing the "does this
 * email have a passkey" enumeration oracle. Authentication with a decoy always
 * fails at the verify step (no authenticator holds it).
 *
 * The COUNT is deterministically 1 or 2 (not always 1), so a response with two
 * descriptors is no longer a clean "real account with multiple passkeys" tell —
 * it could equally be a decoy. Transports are omitted (see normalizeTransports)
 * so a decoy can never differ from a real account by transport type either.
 */
function decoyCredentials(email: string): CredentialDescriptor[] {
  const secret = process.env.NEXTAUTH_SECRET ?? "webauthn-decoy-dev-secret";
  const seed = `webauthn-decoy:${email.toLowerCase()}`;
  const digest = createHmac("sha256", secret).update(seed).digest();
  const count = ((digest[0] ?? 0) & 1) === 0 ? 1 : 2;
  return Array.from({ length: count }, (_unused, i) => ({
    credentialId: createHmac("sha256", secret).update(`${seed}:${i}`).digest("base64url"),
    transports: [],
  }));
}

/**
 * Strip transports from every descriptor. `transports` is an advisory client
 * hint only — the verify route resolves the credential by the id the
 * authenticator actually returns, never by allowCredentials membership — so
 * omitting it does not affect login for platform OR roaming (USB/NFC) keys, but
 * it removes the last shape difference (e.g. a real account exposing `["usb"]`)
 * that a decoy could not reproduce.
 */
function normalizeTransports(creds: CredentialDescriptor[]): CredentialDescriptor[] {
  return creds.map((c) => ({ credentialId: c.credentialId, transports: [] }));
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

  let allowCredentials: CredentialDescriptor[] | undefined;

  // Parse optional email from body
  const body: unknown = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (parsed.success && parsed.data.email) {
    const email = parsed.data.email;
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });

    let realCredentials: CredentialDescriptor[] | undefined;
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
    // — so the response never discloses whether the email has a passkey. Strip
    // transports from both so the shape is identical regardless of the real
    // authenticator type.
    allowCredentials = normalizeTransports(realCredentials ?? decoyCredentials(email));
  }
  // No email provided → usernameless / discoverable-credential flow: leave
  // allowCredentials empty. There is no email to enumerate in this path.

  const { options } = await generateAuthenticationChallenge(allowCredentials);

  return NextResponse.json({ data: options });
}
