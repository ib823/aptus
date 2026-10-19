/**
 * The one-time claim link: a URL from which a key is CREATED when it is collected.
 *
 * THE ORDERING IS THE GUARANTEE. Nothing exists before the key is collected —
 * no SolutionClient row, no token, no hash. Collecting mints the key, returns
 * it once, and marks the link spent. An expired link issues NOTHING, because
 * there is no key sitting behind it to leak, to find in a backup, or to hand to
 * whoever opens the URL next.
 *
 * Collecting is the POST a person's click sends from the link's page, never
 * the GET of the URL itself — see `inspectClaimLink` for why that matters.
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

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { CLIENT_TOKEN_PREFIX, hashClientToken } from "@/lib/northbound/auth";
import { endedCredential, generateClientToken, hasLapsed } from "@/lib/northbound/issue";
import { writeConfigAudit } from "@/lib/studio/audit";
import { refuseCredentialIssuer } from "@/lib/studio/solutions";

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
  | LaneRefusal;

/**
 * The refusals that come from the LANE rather than from the link itself.
 *
 * A link is sent against one state of the app and opened up to 72 hours later
 * against another. Every rule the send route applies can stop holding in that
 * window, so each is checked again when the key is actually minted — the send
 * route's check alone was a check on a moment that had passed.
 */
export type LaneRefusal =
  | "SOLUTION_GONE"
  /** The app was retired. The broker refuses its keys, and reactivating it would wake this one. */
  | "SOLUTION_RETIRED"
  /** The app no longer names all three owners, so nobody is accountable for the key. */
  | "OWNERS_MISSING"
  /** Whoever sent the link owns the app — the self-issuance Studio refuses. */
  | "SENDER_OWNS_APP"
  /** The lane's key was revoked after the link was sent. Opening it must not undo that. */
  | "KEY_REVOKED"
  /** A key was issued for the lane after the link was sent. Opening it would kill that key. */
  | "KEY_ISSUED_SINCE";

/**
 * What a refused link records about itself, so the reason is answerable
 * server-side even though the holder is told only that it did not work.
 */
const LANE_REFUSAL_REASONS: Readonly<Record<LaneRefusal, string>> = {
  SOLUTION_GONE: "The app no longer exists.",
  SOLUTION_RETIRED: "The app was retired.",
  OWNERS_MISSING: "The app no longer names all three owners.",
  SENDER_OWNS_APP: "The person who sent the link owns the app.",
  KEY_REVOKED: "The key was revoked.",
  KEY_ISSUED_SINCE: "A key was issued for this environment after the link was sent.",
};

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

/** What the claim screen may say BEFORE anything is minted: names, never a key. */
export interface ClaimPreview {
  readonly ok: true;
  readonly environment: string;
  readonly solutionName: string;
}

export type ClaimInspection = ClaimPreview | ClaimFailure;

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
 *
 * THE LANE IS READ INSIDE THAT TRANSACTION, and judged by the same rules the
 * read-only check uses. A lane refusal also closes the link with its reason,
 * so the holder still learns only "it did not work" while the record says why.
 *
 * Called only from the POST that the person's own click sends — never from a
 * page render. See `inspectClaimLink` for why.
 */
export async function claimKey(rawClaimToken: string, now: Date = new Date()): Promise<ClaimResult> {
  const opened = await openLink(rawClaimToken, now);
  if (!opened.ok) return opened;
  const { link } = opened;

  let outcome: ClaimOutcome;
  try {
    outcome = await prisma.$transaction(async (tx): Promise<ClaimOutcome> => {
      const facts = await readLaneFacts(tx, link);
      const refusal = refuseLane(link, facts);
      if (refusal !== null) {
        await tx.keyClaimLink.updateMany({
          where: { id: link.id, organizationId: link.organizationId, claimedAt: null, revokedAt: null },
          data: { revokedAt: now, revokedReason: LANE_REFUSAL_REASONS[refusal] },
        });
        return { refused: refusal };
      }

      /*
       * CLAIM THE LINK FIRST, and only if it is still unclaimed. `updateMany`
       * with the guard in the WHERE is the atomic compare-and-set: if a
       * concurrent request got here first, this updates zero rows and we refuse
       * instead of minting a second key. It is also what a revoke, issue or
       * rotate racing this claim wins on — each closes the lane's links before
       * it touches the key, on this same row, and again after it.
       */
      const claimed = await tx.keyClaimLink.updateMany({
        where: { id: link.id, claimedAt: null, revokedAt: null },
        data: { claimedAt: now },
      });
      if (claimed.count === 0) return { refused: "LINK_ALREADY_CLAIMED" };

      return { minted: await mintKey(tx, link, facts, now) };
    });
  } catch {
    return { ok: false, refusal: "SOLUTION_GONE" };
  }

  if ("refused" in outcome) return { ok: false, refusal: outcome.refused };
  const { minted } = outcome;

  /*
   * A MINTED KEY IS AN AUDITED EVENT, like every other way one comes to exist.
   * Claiming wrote no row at all, so a claim that replaced a working key left
   * the trail showing only "claim_link_sent" and an earlier ISSUE — nothing at
   * the moment production stopped authenticating. The actor is the SENDER, for
   * the reason the key's createdById is: the opener may not be a user here.
   */
  await writeConfigAudit({
    organizationId: link.organizationId,
    actorId: link.createdById,
    entityType: "ClientCredential",
    entityId: minted.clientId,
    action: minted.replacedExisting ? "ROTATE" : "ISSUE",
    // The key itself is absent, as it is from every audit row.
    after: {
      event: "claim_link_claimed",
      via: "claim_link",
      linkId: link.id,
      clientId: minted.clientId,
      solutionId: link.solutionId,
      environment: link.environment,
      replacedExisting: minted.replacedExisting,
    },
  });

  return {
    ok: true,
    rawToken: minted.rawToken,
    environment: link.environment,
    solutionName: minted.solutionName,
    tail: minted.rawToken.slice(-4),
  };
}

/**
 * Would this link mint a key if it were opened now? Reads only.
 *
 * WHY THE CLAIM SCREEN ASKS THIS INSTEAD OF CLAIMING. It used to call
 * `claimKey` while rendering the GET, so opening the URL was the claim. Mail
 * scanners (Defender Safe Links) and chat unfurlers (Slack, Teams) GET every
 * URL in a message before a person does — and this product has no mail sender,
 * so every link travels through exactly those channels. The first automated
 * GET received the only copy of the key, and the recipient was told the link
 * could not be used. The GET now shows a button and this preview; minting
 * waits for the POST that a person's click sends, which scanners do not send.
 *
 * It answers with the refusals `claimKey` would give, from the same rules, so
 * the button is offered only where the claim could succeed.
 */
export async function inspectClaimLink(
  rawClaimToken: string,
  now: Date = new Date(),
): Promise<ClaimInspection> {
  const opened = await openLink(rawClaimToken, now);
  if (!opened.ok) return opened;
  const { link } = opened;

  const facts = await readLaneFacts(prisma, link);
  const refusal = refuseLane(link, facts);
  if (refusal !== null) return { ok: false, refusal };
  return { ok: true, environment: link.environment, solutionName: facts.solution?.name ?? "" };
}

interface OpenedLink {
  readonly id: string;
  readonly organizationId: string;
  readonly solutionId: string;
  readonly environment: string;
  readonly createdById: string;
  readonly createdAt: Date;
}

/** The link's own state: is it real, live, unspent and inside its window? */
async function openLink(
  rawClaimToken: string,
  now: Date,
): Promise<{ ok: true; link: OpenedLink } | ClaimFailure> {
  const link = await prisma.keyClaimLink.findUnique({
    where: { tokenHash: hashClaimToken(rawClaimToken) },
    select: {
      id: true,
      organizationId: true,
      solutionId: true,
      environment: true,
      expiresAt: true,
      claimedAt: true,
      revokedAt: true,
      createdById: true,
      createdAt: true,
    },
  });

  if (link === null) return { ok: false, refusal: "UNKNOWN_LINK" };
  if (link.revokedAt !== null) return { ok: false, refusal: "LINK_REVOKED" };
  if (link.claimedAt !== null) return { ok: false, refusal: "LINK_ALREADY_CLAIMED" };
  if (link.expiresAt <= now) return { ok: false, refusal: "LINK_EXPIRED" };
  return { ok: true, link };
}

interface LaneFacts {
  readonly solution: {
    readonly name: string;
    readonly status: string;
    readonly technicalOwnerId: string | null;
    readonly businessOwnerId: string | null;
    readonly supportOwnerId: string | null;
  } | null;
  /** The key the lane holds now, if any — what claiming would replace. */
  readonly client: {
    readonly createdAt: Date;
    readonly isActive: boolean;
    readonly revokedAt: Date | null;
    readonly expiresAt: Date | null;
  } | null;
}

/**
 * The app and the lane's key, as they stand now. Given the transaction when
 * claiming, so the rules are judged on what the write will actually replace.
 */
async function readLaneFacts(db: Prisma.TransactionClient, link: OpenedLink): Promise<LaneFacts> {
  const solution = await db.solution.findFirst({
    where: { id: link.solutionId, organizationId: link.organizationId },
    select: {
      name: true,
      status: true,
      technicalOwnerId: true,
      businessOwnerId: true,
      supportOwnerId: true,
    },
  });
  const client = await db.solutionClient.findFirst({
    where: {
      organizationId: link.organizationId,
      solutionId: link.solutionId,
      environment: link.environment,
    },
    select: { createdAt: true, isActive: true, revokedAt: true, expiresAt: true },
  });
  return { solution, client };
}

/**
 * Would minting now break a rule? The send route's rules, asked again.
 *
 * A KEY REVOKED BEFORE THE LINK WAS SENT is not a refusal. Sending a link to a
 * revoked lane is a deliberate re-key by someone allowed to send one — the
 * same act Studio's re-issue is — and the old write key does not come back
 * with it. A key revoked AFTER the link went out is the case that must hold:
 * revocation is the incident response, and a link already sitting in someone's
 * inbox cannot be the way round it.
 */
function refuseLane(link: OpenedLink, facts: LaneFacts): LaneRefusal | null {
  const { solution, client } = facts;
  if (solution === null) return "SOLUTION_GONE";
  if (solution.status === "RETIRED") return "SOLUTION_RETIRED";

  // Against the SENDER: they are who issues the key, and owners change.
  const issuer = refuseCredentialIssuer(solution, link.createdById);
  if (issuer === "ownersMissing") return "OWNERS_MISSING";
  if (issuer === "issuerIsOwner") return "SENDER_OWNS_APP";

  if (client !== null) {
    if (client.revokedAt !== null && client.revokedAt.getTime() >= link.createdAt.getTime()) {
      return "KEY_REVOKED";
    }
    if (client.createdAt.getTime() > link.createdAt.getTime()) return "KEY_ISSUED_SINCE";
  }
  return null;
}

type ClaimOutcome = { readonly refused: ClaimRefusal } | { readonly minted: MintedKey };

interface MintedKey {
  readonly clientId: string;
  readonly rawToken: string;
  readonly solutionName: string;
  readonly replacedExisting: boolean;
}

/** Write the key onto the lane. Runs inside the claim's transaction, after the compare-and-set. */
async function mintKey(
  tx: Prisma.TransactionClient,
  link: OpenedLink,
  facts: LaneFacts,
  now: Date,
): Promise<MintedKey> {
  const rawToken = generateClientToken();
  const solutionName = facts.solution?.name ?? "";
  const existing = facts.client;

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
      label: `${solutionName} · ${link.environment}`,
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
      /*
       * "Collect or renew the key" is what an expired lane says, and this is
       * the renewal. Keeping the lapsed expiry handed over a key shown once as
       * working and refused as EXPIRED on its first call.
       */
      ...(existing !== null && hasLapsed(existing.expiresAt, now) ? { expiresAt: null } : {}),
      // A revived key does not bring the old write key back. See `endedCredential`.
      ...(endedCredential(existing) ? { secretsCiphertext: null } : {}),
    },
    select: { id: true },
  });

  await tx.keyClaimLink.update({
    where: { id: link.id },
    data: { claimedClientId: client.id },
  });

  return { clientId: client.id, rawToken, solutionName, replacedExisting: existing !== null };
}

/** The prefix a key carries, re-exported so the claim screen can mask it. */
export { CLIENT_TOKEN_PREFIX };
