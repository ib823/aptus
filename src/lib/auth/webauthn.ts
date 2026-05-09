/** WebAuthn challenge generation & verification using @simplewebauthn/server */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse as verifyRegistration,
  generateAuthenticationOptions,
  verifyAuthenticationResponse as verifyAuthentication,
} from "@simplewebauthn/server";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// --- Config from env vars (derive from NEXTAUTH_URL when explicit vars are absent) ---

function deriveFromNextAuthUrl() {
  const raw = process.env.NEXTAUTH_URL;
  if (!raw) return { hostname: "localhost", origin: "http://localhost:3003" };
  try {
    const url = new URL(raw);
    return { hostname: url.hostname, origin: url.origin };
  } catch {
    return { hostname: "localhost", origin: "http://localhost:3003" };
  }
}

const _derived = deriveFromNextAuthUrl();
const rpID = process.env.WEBAUTHN_RP_ID ?? _derived.hostname;
const rpName = process.env.WEBAUTHN_RP_NAME ?? "Aptus";
const origin = process.env.WEBAUTHN_ORIGIN ?? _derived.origin;

const CHALLENGE_COOKIE_NAME = "webauthn-challenge";
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * HMAC secret for the WebAuthn challenge cookie. Fail-closed in any environment
 * other than `test`: a literal fallback secret would let any attacker who knows
 * the constant mint valid challenges and bypass the one-time-use replay guard.
 */
function getHmacSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "test") return "test-only-webauthn-hmac-secret-do-not-use";
  throw new Error(
    "NEXTAUTH_SECRET must be set (>=16 chars) for WebAuthn challenge signing",
  );
}

// --- Challenge cookie helpers (HMAC-SHA256 signed, no DB round-trip) ---

function signChallenge(challenge: string, expiresAt: number): string {
  const payload = `${challenge}.${expiresAt}`;
  const hmac = createHmac("sha256", getHmacSecret()).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

function verifyChallengeCookie(cookieValue: string): string | null {
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;

  const [challenge, expiresAtStr, providedHmac] = parts;
  if (!challenge || !expiresAtStr || !providedHmac) return null;

  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || Date.now() > expiresAt) return null;

  const expectedHmac = createHmac("sha256", getHmacSecret())
    .update(`${challenge}.${expiresAtStr}`)
    .digest("hex");

  const a = Buffer.from(providedHmac, "hex");
  const b = Buffer.from(expectedHmac, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return challenge;
}

export async function setChallengeInCookie(challenge: string): Promise<void> {
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const signed = signChallenge(challenge, expiresAt);

  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE_NAME, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.ceil(CHALLENGE_TTL_MS / 1000),
  });
}

export async function getChallengeFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(CHALLENGE_COOKIE_NAME);
  if (!cookie?.value) return null;

  // Delete after reading (one-time use)
  cookieStore.delete(CHALLENGE_COOKIE_NAME);

  return verifyChallengeCookie(cookie.value);
}

// --- Registration ---

interface RegistrationUser {
  id: string;
  email: string;
  name: string;
}

interface ExistingCredential {
  credentialId: string;
  transports?: string[];
}

export async function generateRegistrationChallenge(
  user: RegistrationUser,
  existingCredentials: ExistingCredential[],
): Promise<{
  options: PublicKeyCredentialCreationOptionsJSON;
  challenge: string;
}> {
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.credentialId,
      transports: (cred.transports ?? []) as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  await setChallengeInCookie(options.challenge);

  return { options, challenge: options.challenge };
}

export async function verifyRegistrationResponse(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
) {
  const verification = await verifyRegistration({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  return verification;
}

// --- Authentication ---

interface AllowCredential {
  credentialId: string;
  transports?: string[];
}

export async function generateAuthenticationChallenge(
  allowCredentials?: AllowCredential[],
): Promise<{
  options: PublicKeyCredentialRequestOptionsJSON;
  challenge: string;
}> {
  const opts: Parameters<typeof generateAuthenticationOptions>[0] = {
    rpID,
    userVerification: "preferred",
  };

  if (allowCredentials) {
    opts.allowCredentials = allowCredentials.map((cred) => ({
      id: cred.credentialId,
      transports: (cred.transports ?? []) as AuthenticatorTransportFuture[],
    }));
  }

  const options = await generateAuthenticationOptions(opts);

  await setChallengeInCookie(options.challenge);

  return { options, challenge: options.challenge };
}

export async function verifyAuthenticationResponse(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credential: {
    credentialId: string;
    publicKey: Buffer;
    counter: number;
    transports?: string[];
  },
) {
  const verification = await verifyAuthentication({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: credential.credentialId,
      publicKey: new Uint8Array(credential.publicKey),
      counter: credential.counter,
      transports: (credential.transports ?? []) as AuthenticatorTransportFuture[],
    },
  });

  return verification;
}
