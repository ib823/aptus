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
 * Stored sealed with AES-256-GCM, bound by AAD to (organization, solution,
 * CREDENTIAL ROW), so a ciphertext lifted onto another row will not open —
 * another solution's, and since AD-11 another environment's too. Verified in
 * constant time.
 *
 * ONE PER CREDENTIAL ROW. A solution holds one runtime credential per
 * environment (AD-11); the write key seals onto the row whose environment the
 * write grant covers, and is verified against the row that authenticated the
 * call — never against a sibling environment's.
 */

import { timingSafeEqual } from "crypto";

import { prisma } from "@/lib/db/prisma";
import type { PrefetchedWriteKey } from "@/lib/northbound/auth";
import { KeyIssuerRefused, refuseKeyIssuer } from "@/lib/northbound/issue";
import { isKeyLive } from "@/lib/northbound/key-policy";
import { solutionClientAad, solutionClientRowAad } from "@/lib/sap-public/connection-crypto";
import { openSecretsForOrg, sealSecretsForOrg } from "@/lib/sap-public/secret-envelope";
import { lockSolutionOwnership } from "@/lib/studio/owner-lock";
import { scopedById, scopedWhere, type TenantScope } from "@/lib/studio/tenant-scope";

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
 *
 * ONE TRANSACTION, LOCKED ON THE APP, like every other key change (issue.ts,
 * review round 2 of P0.1). The write is made under the Solution row lock that
 * the owner-slot PATCH takes, after re-applying the owner gate to `gate`'s
 * issuer while holding it, and only onto a credential still live under that
 * lock. The route's own check ran on a moment that had passed: a colleague's
 * PATCH putting the issuer into an owner slot could commit between it and
 * this write, and the issuer then owned the app AND had minted its write key.
 * Throws KeyIssuerRefused, and nothing is written. False when the credential
 * is gone, or was revoked or deactivated before the lock was held.
 */
export async function setWriteCredential(
  scope: TenantScope,
  /**
   * The credential ROW, not the solution. A solution holds one credential per
   * environment (AD-11), and a write key belongs to exactly one of them — the
   * one whose environment the write grant covers.
   */
  clientId: string,
  rawKey: string,
  /** The owner gate, re-applied under the app lock with the write: names the person minting the key. */
  gate?: { readonly issuerId: string },
): Promise<boolean> {
  const client = await prisma.solutionClient.findFirst({
    where: scopedById(scope, clientId),
    select: { id: true, solutionId: true },
  });
  if (!client) return false;

  // Sealed before the lock is taken: it reads the organization's envelope key,
  // and the lock is held only for the checks and the write.
  const secretsCiphertext = await sealSecretsForOrg(
    scope.organizationId,
    { writeSecret: rawKey },
    solutionClientRowAad(scope.organizationId, client.solutionId, client.id),
  );

  return prisma.$transaction(async (tx) => {
    await lockSolutionOwnership(tx, { organizationId: scope.organizationId, solutionId: client.solutionId });
    if (gate !== undefined) {
      const refusal = await refuseKeyIssuer(tx, scope.organizationId, client.solutionId, gate.issuerId);
      if (refusal !== null) throw new KeyIssuerRefused(refusal);
    }
    // Re-read under the lock: a revocation that landed first ended this
    // credential, and destroyed its write key (A37). Sealing one onto it now
    // would put the key back on a row nobody can authenticate with. An
    // expired credential counts as ended too (P0.11): its token is refused.
    const live = await tx.solutionClient.findFirst({
      where: scopedWhere(scope, { id: client.id, isActive: true, revokedAt: null }),
      select: { id: true, isActive: true, revokedAt: true, expiresAt: true },
    });
    if (live === null || !isKeyLive(live, new Date())) return false;
    await tx.solutionClient.update({
      where: { id: client.id, organizationId: scope.organizationId },
      data: { secretsCiphertext },
    });
    return true;
  });
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
  /**
   * The CALLING credential's row id — the token that authenticated this
   * request. Verified against that row, never against "some credential of the
   * solution": with one credential per environment, a write key minted for
   * TEST must not authorise a call made with the DEV token.
   */
  clientId: string,
  presented: string | null,
  now: Date = new Date(),
  /**
   * The same row's write-key fields, read by authentication in the statement
   * that found the key (auth.ts `withWriteKey`, P0.19), so the write route
   * does not read the row twice. The caller passes them for `clientId`'s own
   * row only; without them the row is read here, scoped as before.
   */
  prefetched?: { readonly solutionId: string } & PrefetchedWriteKey,
): Promise<boolean> {
  if (!presented) return false;

  const client = prefetched
    ? { id: clientId, ...prefetched }
    : await prisma.solutionClient.findFirst({
        where: scopedById(scope, clientId),
        select: {
          id: true,
          solutionId: true,
          secretsCiphertext: true,
          isActive: true,
          revokedAt: true,
          expiresAt: true,
        },
      });
  if (!client?.secretsCiphertext) return false;
  /*
   * THE WRITE KEY ENDS WHEN ITS CREDENTIAL DOES (P0.11). It is sealed on the
   * bearer token's own row, so it has no expiry of its own: the row's is its.
   * The write route authenticates the bearer token first and would already
   * have refused an expired one; asking again here keeps that true for any
   * caller that verifies a write key on its own.
   */
  if (!isKeyLive(client, now)) return false;

  let stored: string | undefined;
  try {
    stored = await openWriteKey(scope.organizationId, { ...client, secretsCiphertext: client.secretsCiphertext });
  } catch {
    /*
     * A blob that will not open under this row's AAD is corrupt, was sealed for
     * a different row, or predates the per-row binding.
     *
     * NOT ACCEPTED in any of those cases — accepting a v1 blob would keep the
     * hole open exactly where it was: every credential of a solution shared the
     * v1 AAD, so a ciphertext copied from the TEST row onto the DEV row opened,
     * and accepting it here would make the copy permanent on first use. The
     * migration that introduced the row binding clears v1 blobs for this
     * reason, so a deployment should hold none; it is reported rather than
     * swallowed, because "re-issue the write key" is a fixable answer and a
     * silent 403 is not.
     */
    if (await isLegacySealed(client.secretsCiphertext, scope.organizationId, client.solutionId)) {
      console.warn(
        "[northbound] write key sealed under the pre-AD-11 binding; it is refused and must be re-issued",
        { clientId: client.id, solutionId: client.solutionId },
      );
    }
    return false;
  }
  if (!stored) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(stored);
  // Length is compared first because timingSafeEqual throws on a mismatch; the
  // length of a secret is not the part worth protecting.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Open a credential row's sealed write key under the row's own binding. Throws when it will not open. */
async function openWriteKey(
  organizationId: string,
  row: { readonly id: string; readonly solutionId: string; readonly secretsCiphertext: string },
): Promise<string | undefined> {
  return (
    await openSecretsForOrg(
      organizationId,
      row.secretsCiphertext,
      solutionClientRowAad(organizationId, row.solutionId, row.id),
    )
  ).writeSecret;
}

/**
 * Would `verifyWriteCredential` find a key to compare against on this row?
 * The same open, under the same binding: false when the blob will not open or
 * holds no write key, which is when the write route refuses every write from
 * this credential whatever key is presented.
 *
 * FOR THE LANE BOARD (P0.2), which used to ask only whether a blob exists and
 * so drew Live a write lane whose every write is refused. The key is opened
 * and dropped here; it never leaves this function.
 */
export async function writeKeyOpens(
  organizationId: string,
  row: { readonly id: string; readonly solutionId: string; readonly secretsCiphertext: string },
): Promise<boolean> {
  try {
    return Boolean(await openWriteKey(organizationId, row));
  } catch {
    return false;
  }
}

/**
 * Would this blob have opened under the superseded (organization, solution)
 * binding? Diagnosis only — the value is never read out and never accepted.
 */
async function isLegacySealed(
  ciphertext: string,
  organizationId: string,
  solutionId: string,
): Promise<boolean> {
  try {
    await openSecretsForOrg(organizationId, ciphertext, solutionClientAad(organizationId, solutionId));
    return true;
  } catch {
    return false;
  }
}

/** Does ANY of the solution's credentials carry a write key? Metadata for the UI — never the value. */
export async function hasWriteCredential(
  scope: TenantScope,
  solutionId: string,
): Promise<boolean> {
  const client = await prisma.solutionClient.findFirst({
    where: scopedWhere(scope, { solutionId, NOT: { secretsCiphertext: null } }),
    select: { id: true },
  });
  return client !== null;
}
