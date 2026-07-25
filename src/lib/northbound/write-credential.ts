/**
 * The per-solution WRITE credential.
 *
 * WHY A SECOND SECRET. The bearer token authenticates the solution; this proves
 * the caller is additionally entitled to write. Keeping them separate means a
 * leaked read token — the one that travels furthest, gets logged by proxies and
 * pasted into issues — cannot create records in a customer's SAP system. The
 * write key can be held more tightly, deployed to fewer places, and rotated on a
 * different schedule.
 *
 * It is NOT the shared env write secret the admin path uses. That one is scoped
 * per product, so every solution would share it: a leak anywhere would be a leak
 * everywhere, and revoking it would break every integration at once.
 *
 * Stored sealed with AES-256-GCM, bound by AAD to (organization, solution), so a
 * ciphertext lifted onto another solution's row will not open. Verified in
 * constant time.
 */

import { timingSafeEqual } from "crypto";

import { prisma } from "@/lib/db/prisma";
import { openSecrets, sealSecrets, solutionClientAad } from "@/lib/sap-public/connection-crypto";
import { scopedWhere, type TenantScope } from "@/lib/studio/tenant-scope";

/** Distinct prefix from the read token, so the two are never confused in a log. */
export const WRITE_KEY_PREFIX = "cew_";

export function generateWriteCredential(): string {
  // 32 bytes, same strength as the bearer token.
  return `${WRITE_KEY_PREFIX}${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}`;
}

/**
 * Seal a write credential onto a solution's client row.
 *
 * Sealed rather than hashed because it is verified by comparison against a value
 * we must be able to recover — unlike the bearer token, which is looked up BY its
 * hash. The AAD binding is what stops the sealed blob being useful elsewhere.
 */
export async function setWriteCredential(
  scope: TenantScope,
  solutionId: string,
  rawKey: string,
): Promise<boolean> {
  const client = await prisma.solutionClient.findFirst({
    where: scopedWhere(scope, { solutionId }),
    select: { id: true },
  });
  if (!client) return false;

  await prisma.solutionClient.update({
    where: { id: client.id },
    data: {
      secretsCiphertext: sealSecrets(
        { writeSecret: rawKey },
        solutionClientAad(scope.organizationId, solutionId),
      ),
    },
  });
  return true;
}

/**
 * Verify a presented write credential.
 *
 * Returns false for every failure — absent header, no credential configured,
 * wrong value — because the caller must not learn WHICH. "No write key is set
 * for this solution" tells an attacker they only need to find one secret.
 */
export async function verifyWriteCredential(
  scope: TenantScope,
  solutionId: string,
  presented: string | null,
): Promise<boolean> {
  if (!presented) return false;

  const client = await prisma.solutionClient.findFirst({
    where: scopedWhere(scope, { solutionId }),
    select: { secretsCiphertext: true },
  });
  if (!client?.secretsCiphertext) return false;

  let stored: string | undefined;
  try {
    stored = openSecrets(
      client.secretsCiphertext,
      solutionClientAad(scope.organizationId, solutionId),
    ).writeSecret;
  } catch {
    // A blob that will not open under this row's AAD is either corrupt or was
    // sealed for a different row. Either way it is not a valid credential here.
    return false;
  }
  if (!stored) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(stored);
  // Length is compared first because timingSafeEqual throws on a mismatch; the
  // length of a secret is not the part worth protecting.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Is a write credential configured at all? Metadata for the UI — never the value. */
export async function hasWriteCredential(
  scope: TenantScope,
  solutionId: string,
): Promise<boolean> {
  const client = await prisma.solutionClient.findFirst({
    where: scopedWhere(scope, { solutionId }),
    select: { secretsCiphertext: true },
  });
  return Boolean(client?.secretsCiphertext);
}
