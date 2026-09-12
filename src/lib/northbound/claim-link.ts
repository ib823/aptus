/**
 * The one-time claim link: a URL that CREATES a key when it is opened.
 *
 * THE ORDERING IS THE GUARANTEE. Nothing exists before the link is opened — no
 * SolutionClient row, no token, no hash. Opening it mints the key, returns it
 * once, and marks the link spent. An expired link issues NOTHING, because there
 * is no key sitting behind it to leak, to find in a backup, or to hand to
 * whoever opens the URL next.
 *
 * The alternative — minting the key up front and merely revealing it — makes
 * "shown once" a UI convention described as a guarantee, and makes the lane
 * state after expiry a lie: the lane would read "no key" while a working
 * credential existed.
 *
 * WHY EVERY REFUSAL RETURNS THE SAME SHAPE. A caller holding a wrong, expired,
 * spent or revoked token learns only that it did not work. Distinguishing them
 * in the response would let someone with a guessed token learn whether it was
 * ever real — the same reason the northbound broker answers one uniform 401 to
 * six different token failures. The REASON is still recorded server-side and
 * shown to the app owner on their own lane, where the identity is already known.
 */

import { createHash, randomBytes } from "crypto";

import { prisma } from "@/lib/db/prisma";
import { CLIENT_TOKEN_PREFIX, hashClientToken } from "@/lib/northbound/auth";
import { generateClientToken } from "@/lib/northbound/issue";

/** Claim tokens are their own namespace, so one can never be mistaken for a key. */
export const CLAIM_TOKEN_PREFIX = "cec_";

/** How long a link mints a key for. Short on purpose: it is a delivery window. */
export const CLAIM_LINK_TTL_MS = 72 * 60 * 60 * 1000;

export function generateClaimToken(): string {
  return `${CLAIM_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/**
 * SHA-256, the same shape SolutionClient uses. A database copy grants nothing:
 * the raw token exists only in the URL that was sent.
 */
export function hashClaimToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type ClaimRefusal =
  | "UNKNOWN_LINK"
  | "LINK_EXPIRED"
  | "LINK_ALREADY_CLAIMED"
  | "LINK_REVOKED"
  | "SOLUTION_GONE";

export interface ClaimSuccess {
  readonly ok: true;
  /** The key. Exists for this one response and is never re-readable. */
  readonly rawToken: string;
  readonly environment: string;
  readonly solutionName: string;
  /** The last four characters, for the lane's masked reference afterwards. */
  readonly tail: string;
}

export interface ClaimFailure {
  readonly ok: false;
  readonly refusal: ClaimRefusal;
}

export type ClaimResult = ClaimSuccess | ClaimFailure;

export interface CreateClaimLinkInput {
  readonly organizationId: string;
  readonly solutionId: string;
  readonly environment: string;
  readonly createdById: string;
  readonly now?: Date;
}

export interface CreatedClaimLink {
  readonly id: string;
  /** The raw token. Goes into the URL and is never stored. */
  readonly rawToken: string;
  readonly expiresAt: Date;
}

/**
 * Send a new link, superseding any live one for the same lane.
 *
 * Superseding REVOKES rather than deletes, so "you were sent three links" stays
 * answerable — and so a link that arrives after a newer one was issued fails
 * with a recorded reason rather than silently doing nothing.
 */
export async function createClaimLink(input: CreateClaimLinkInput): Promise<CreatedClaimLink> {
  const now = input.now ?? new Date();
  const rawToken = generateClaimToken();

  await prisma.keyClaimLink.updateMany({
    where: {
      organizationId: input.organizationId,
      solutionId: input.solutionId,
      environment: input.environment,
      claimedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: now, revokedReason: "A newer link was sent." },
  });

  const link = await prisma.keyClaimLink.create({
    data: {
      organizationId: input.organizationId,
      solutionId: input.solutionId,
      environment: input.environment,
      tokenHash: hashClaimToken(rawToken),
      createdById: input.createdById,
      expiresAt: new Date(now.getTime() + CLAIM_LINK_TTL_MS),
    },
    select: { id: true, expiresAt: true },
  });

  return { id: link.id, rawToken, expiresAt: link.expiresAt };
}

/**
 * Open a link: mint the key, once.
 *
 * THE WHOLE OPERATION IS ONE TRANSACTION, and the link is marked spent inside
 * it. Two people opening the same URL at the same instant must not produce two
 * keys — the second finds the link already claimed and is refused. The unique
 * constraint on (organization, solution, environment) would catch the duplicate
 * anyway, but as a crash rather than as an answer.
 */
export async function claimKey(rawClaimToken: string, now: Date = new Date()): Promise<ClaimResult> {
  const tokenHash = hashClaimToken(rawClaimToken);

  const link = await prisma.keyClaimLink.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      organizationId: true,
      solutionId: true,
      environment: true,
      expiresAt: true,
      claimedAt: true,
      revokedAt: true,
      createdById: true,
    },
  });

  if (link === null) return { ok: false, refusal: "UNKNOWN_LINK" };
  if (link.revokedAt !== null) return { ok: false, refusal: "LINK_REVOKED" };
  if (link.claimedAt !== null) return { ok: false, refusal: "LINK_ALREADY_CLAIMED" };
  if (link.expiresAt <= now) return { ok: false, refusal: "LINK_EXPIRED" };

  const solution = await prisma.solution.findFirst({
    where: { id: link.solutionId, organizationId: link.organizationId },
    select: { id: true, name: true, status: true },
  });
  if (solution === null) return { ok: false, refusal: "SOLUTION_GONE" };

  const rawToken = generateClientToken();

  try {
    const result = await prisma.$transaction(async (tx) => {
      /*
       * CLAIM THE LINK FIRST, and only if it is still unclaimed. `updateMany`
       * with the guard in the WHERE is the atomic compare-and-set: if a
       * concurrent request got here first, this updates zero rows and we refuse
       * instead of minting a second key.
       */
      const claimed = await tx.keyClaimLink.updateMany({
        where: { id: link.id, claimedAt: null, revokedAt: null },
        data: { claimedAt: now },
      });
      if (claimed.count === 0) return null;

      const client = await tx.solutionClient.upsert({
        where: {
          organizationId_solutionId_environment: {
            organizationId: link.organizationId,
            solutionId: link.solutionId,
            environment: link.environment,
          },
        },
        create: {
          organizationId: link.organizationId,
          solutionId: link.solutionId,
          environment: link.environment,
          label: `${solution.name} · ${link.environment}`,
          tokenHash: hashClientToken(rawToken),
          isActive: true,
          /*
           * The person who SENT the link owns the resulting key, not whoever
           * opened the URL: the opener is authenticated by holding the token
           * and may not be a user of this system at all. An earlier draft put
           * the organization id here, which would have been a foreign key to a
           * user that does not exist.
           */
          createdById: link.createdById,
        },
        /*
         * An upsert rather than a create because one key per
         * (solution, environment) is a unique constraint: if a key already
         * exists for this lane, claiming REPLACES it, which is the same
         * semantics rotation already has. The old token stops working the
         * instant this returns — there is deliberately no overlap window,
         * because an overlap is how a leaked credential survives its rotation.
         */
        update: {
          tokenHash: hashClientToken(rawToken),
          isActive: true,
          revokedAt: null,
        },
        select: { id: true },
      });

      await tx.keyClaimLink.update({
        where: { id: link.id },
        data: { claimedClientId: client.id },
      });

      return client.id;
    });

    if (result === null) return { ok: false, refusal: "LINK_ALREADY_CLAIMED" };
  } catch {
    return { ok: false, refusal: "SOLUTION_GONE" };
  }

  return {
    ok: true,
    rawToken,
    environment: link.environment,
    solutionName: solution.name,
    tail: rawToken.slice(-4),
  };
}

/** The prefix a key carries, re-exported so the claim screen can mask it. */
export { CLIENT_TOKEN_PREFIX };
