/** WebAuthn credential CRUD helpers */

import { createHash } from "crypto";

import { prisma } from "@/lib/db/prisma";
import type { WebAuthnCredential } from "@prisma/client";

export async function getUserCredentials(
  userId: string,
): Promise<WebAuthnCredential[]> {
  return prisma.webAuthnCredential.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCredentialByCredentialId(
  credentialId: string,
): Promise<WebAuthnCredential | null> {
  return prisma.webAuthnCredential.findUnique({
    where: { credentialId },
  });
}

export async function saveCredential(
  userId: string,
  registrationInfo: {
    credential: {
      id: string;
      publicKey: Uint8Array;
      counter: number;
      transports?: string[];
    };
    credentialDeviceType: string;
    credentialBackedUp: boolean;
  },
  deviceName?: string,
): Promise<WebAuthnCredential> {
  return prisma.webAuthnCredential.create({
    data: {
      userId,
      credentialId: registrationInfo.credential.id,
      publicKey: Buffer.from(registrationInfo.credential.publicKey),
      counter: registrationInfo.credential.counter,
      transports: registrationInfo.credential.transports ?? [],
      deviceType: registrationInfo.credentialDeviceType,
      backedUp: registrationInfo.credentialBackedUp,
      deviceName: deviceName ?? null,
    },
  });
}

export async function updateCredentialCounter(
  credentialId: string,
  newCounter: number,
): Promise<void> {
  await prisma.webAuthnCredential.update({
    where: { credentialId },
    data: {
      counter: newCounter,
      lastUsedAt: new Date(),
    },
  });
}

export async function deleteCredential(
  credentialId: string,
  userId: string,
): Promise<boolean> {
  // Ownership check — only delete if credential belongs to user
  const result = await prisma.webAuthnCredential.deleteMany({
    where: { credentialId, userId },
  });
  return result.count > 0;
}

export async function getUserByCredentialId(
  credentialId: string,
): Promise<{
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
} | null> {
  const credential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      },
    },
  });

  return credential?.user ?? null;
}

export async function renameCredential(
  credentialId: string,
  userId: string,
  deviceName: string,
): Promise<boolean> {
  const result = await prisma.webAuthnCredential.updateMany({
    where: { credentialId, userId },
    data: { deviceName },
  });
  return result.count > 0;
}

export async function getUserCredentialCount(userId: string): Promise<number> {
  return prisma.webAuthnCredential.count({
    where: { userId },
  });
}

/**
 * Spend a passkey SIGN-IN challenge. True the first time, false ever after.
 *
 * The challenge cookie proves only that the server issued the challenge, and
 * recently. It is stateless, so a captured cookie and assertion would sign in
 * again, minting a new session that counts as stepped up
 * (`markSessionPasskeyAsserted`), for as long as the cookie lives; synced
 * passkeys report a signature counter of 0, so the counter cannot catch it.
 * Called once the signature has verified, so only a genuine assertion leaves a
 * row. `skipDuplicates` turns a second insert of the same hash into a count of
 * 0 rather than an error, and two racing replays cannot both win.
 *
 * Rows are kept only until the challenge would have expired. The sweep is
 * opportunistic, on the next sign-in, and served by the index on expiresAt.
 */
export async function consumeSignInChallenge(challenge: string, ttlSeconds: number): Promise<boolean> {
  const now = new Date();
  await prisma.webAuthnChallengeUse.deleteMany({ where: { expiresAt: { lt: now } } });
  const { count } = await prisma.webAuthnChallengeUse.createMany({
    data: [
      {
        challengeHash: createHash("sha256").update(challenge).digest("hex"),
        usedAt: now,
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      },
    ],
    skipDuplicates: true,
  });
  return count === 1;
}
