/**
 * Issuing, rotating and revoking a solution's client credential.
 *
 * THE RAW TOKEN EXISTS FOR ONE MOMENT. It is generated, hashed, the hash is
 * stored, and the raw value is handed back to the caller exactly once. Nothing
 * writes it to the database, and nothing logs it. That is why the UI has to say
 * "copy it now" — not as a courtesy, but because the system genuinely cannot
 * show it again, and a system that *could* would put a working credential in
 * every backup.
 *
 * ROTATION IS A REPLACEMENT, NOT AN EDIT. Rotating overwrites the hash, so the
 * previous token stops authenticating the instant the new one is issued. There
 * is deliberately no grace period where both work: an overlap window is exactly
 * how a leaked credential survives its own rotation.
 *
 * EVERY KEY CHANGE IS ONE TRANSACTION, LOCKED ON THE APP (P0.1). Issue, rotate
 * and revoke each take the Solution row lock (lib/studio/owner-lock.ts) — the
 * one every owner-slot change, decision and claim-link send also takes — and
 * then, inside the same transaction: re-check the issuer against the app's
 * LIVE owners (a reclaim fired at the same moment either lands first and is
 * seen, or waits), close the lane's pending claim links, write the key, and
 * close them again. Nothing commits unless everything does: a failed close
 * leaves the old key standing and returns no token, instead of a new key
 * with a live link still aimed at it — the link that, opened later, replaced
 * the token its holder had just been shown.
 */

import { randomBytes } from "crypto";

import { prisma } from "@/lib/db/prisma";
import { CLIENT_TOKEN_PREFIX, hashClientToken } from "@/lib/northbound/auth";
import { lockSolutionOwnership } from "@/lib/studio/owner-lock";
import { refuseCredentialIssuerLive } from "@/lib/studio/owner-liveness";
import { scopedById, scopedWhere, type TenantScope } from "@/lib/studio/tenant-scope";

/** The transaction a key change runs in. */
type KeyTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Why the person asking may not mint this app's key, judged under the lock.
 *
 * `ownersMissing` counts a departed owner's slot as empty (owner-liveness.ts,
 * A69): an owner who has left can no longer answer for the key.
 */
export type KeyIssuerRefusal =
  | { readonly reason: "solutionGone" }
  | { readonly reason: "solutionRetired" }
  | {
      readonly reason: "ownersMissing";
      readonly missing: readonly string[];
      /** True when a slot is missing because its owner was deactivated or left. */
      readonly departed: boolean;
    }
  | { readonly reason: "issuerIsOwner" };

/** Thrown inside the key change's transaction, so nothing it did commits. */
export class KeyIssuerRefused extends Error {
  constructor(readonly refusal: KeyIssuerRefusal) {
    super(`key change refused: ${refusal.reason}`);
    this.name = "KeyIssuerRefused";
  }
}

/**
 * The two-human rule for minting a key, on LIVE owners: the app exists and is
 * not retired, all three slots are held by active members of its
 * organization, and the issuer holds none of them. Exported so a route can
 * refuse early (before asking for a passkey) with the same rule the
 * transaction re-applies under the lock.
 */
export async function refuseKeyIssuer(
  db: Pick<typeof prisma, "solution" | "user">,
  organizationId: string,
  solutionId: string,
  issuerId: string,
): Promise<KeyIssuerRefusal | null> {
  const solution = await db.solution.findFirst({
    where: { id: solutionId, organizationId },
    select: { status: true, technicalOwnerId: true, businessOwnerId: true, supportOwnerId: true },
  });
  if (solution === null) return { reason: "solutionGone" };
  if (solution.status === "RETIRED") return { reason: "solutionRetired" };
  const refusal = await refuseCredentialIssuerLive(db, organizationId, solution, issuerId);
  if (refusal === null) return null;
  return refusal.refusal === "ownersMissing"
    ? { reason: "ownersMissing", missing: refusal.missing, departed: refusal.departed.length > 0 }
    : { reason: "issuerIsOwner" };
}

/** Lock the app, then — when an issuer is named — re-apply the owner gate. */
async function lockAndGate(
  tx: KeyTx,
  organizationId: string,
  solutionId: string,
  issuerId: string | undefined,
): Promise<void> {
  await lockSolutionOwnership(tx, { organizationId, solutionId });
  if (issuerId === undefined) return;
  const refusal = await refuseKeyIssuer(tx, organizationId, solutionId, issuerId);
  if (refusal !== null) throw new KeyIssuerRefused(refusal);
}

/** The lane a claim link mints for: one key per (solution, environment). */
export interface ClaimLinkLane {
  readonly organizationId: string;
  readonly solutionId: string;
  /** Omitted to close every environment's links — retiring closes the whole app. */
  readonly environment?: string;
}

/**
 * Close every claim link still waiting on a lane, with the reason recorded.
 *
 * WHY THIS EXISTS. Sending a new link was the only thing that ever closed a
 * pending one. Issuing, rotating or revoking the same key elsewhere left the
 * link live for the rest of its 72 hours, and opening it then replaced
 * whatever the lane held: it silently killed a key a colleague had just
 * issued, or un-revoked one an admin had just revoked. Every change to a
 * lane's key now closes the links that were sent against the old state of it.
 *
 * IN THE KEY CHANGE'S OWN TRANSACTION, before the key is written and again
 * after. The two closes and the write commit together or not at all, so a
 * failed close can no longer leave a changed key with a live link aimed at
 * it (the second close used to be a separate, best-effort statement after the
 * write). The second close is the backstop for a link sent mid-change by a
 * path that does not take the app lock; every path in this repository now
 * does (`createClaimLink` included), so it finds nothing in practice.
 *
 * It lives here rather than in claim-link.ts because every path that changes
 * a lane's key already runs through this module, and claim-link.ts imports
 * from this one — so the dependency still points one way.
 */
export async function closePendingClaimLinks(
  lane: ClaimLinkLane,
  reason: string,
  now: Date = new Date(),
  // A caller already inside a transaction passes it, so the close runs on that
  // connection instead of waiting for a second one from the pool.
  db: Pick<typeof prisma, "keyClaimLink"> = prisma,
): Promise<number> {
  const closed = await db.keyClaimLink.updateMany({
    where: {
      organizationId: lane.organizationId,
      solutionId: lane.solutionId,
      ...(lane.environment === undefined ? {} : { environment: lane.environment }),
      claimedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: now, revokedReason: reason },
  });
  return closed.count;
}

/**
 * Has this stored expiry already passed?
 *
 * Renewal must not carry a lapsed expiry onto the new token: the key would be
 * shown once as working and refused as EXPIRED on its first call, and the only
 * way out was a Studio re-issue. A future expiry is the issuer's decision and
 * is kept.
 */
export function hasLapsed(expiresAt: Date | null, now: Date): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

/**
 * Is this credential row one that was ENDED, so writing a token onto it
 * brings it back?
 *
 * A revived row must not bring its old write key back with it. The write key
 * is sealed against the row id, and every way of reviving a credential reuses
 * the same row — so a `cew_` key taken alongside a revoked token would verify
 * again beside the new token, with no ISSUE_WRITE gate and no ISSUE_WRITE
 * audit. Revocation now destroys the write key itself; this covers rows that
 * were revoked before it did, and rows deactivated without being revoked.
 */
export function endedCredential(row: { revokedAt: Date | null; isActive: boolean } | null): boolean {
  return row !== null && (row.revokedAt !== null || !row.isActive);
}

/** 32 bytes of CSPRNG entropy, base64url, behind a greppable prefix. */
export function generateClientToken(): string {
  return `${CLIENT_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export type ClientEnvironment = "SANDBOX" | "DEV" | "TEST" | "PROD";

export interface IssuedClient {
  id: string;
  solutionId: string;
  label: string;
  environment: string;
  /** The SAP client this credential may read, or null when it names none. */
  sapClient: string | null;
  createdAt: Date;
  /** Present ONLY on the response that created or rotated it. Never re-readable. */
  rawToken: string;
}

export interface ClientSummary {
  id: string;
  solutionId: string;
  label: string;
  environment: string;
  /** The SAP client this credential may read, or null when it names none. */
  sapClient: string | null;
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/**
 * Issue the runtime credential for a solution IN AN ENVIRONMENT.
 *
 * One client per (solution, environment), enforced by a unique constraint, so
 * calling this twice for the same environment ROTATES rather than accumulating
 * — four live tokens for one environment is four things to leak and four to
 * remember to revoke. A different environment is a different credential: an
 * application promoted DEV → TEST → PROD holds one per stage, and issuing the
 * TEST one no longer kills DEV (AD-11).
 */
export async function issueClientToken(
  scope: TenantScope,
  input: {
    solutionId: string;
    label: string;
    environment: ClientEnvironment;
    /**
     * The SAP client to bind this credential to — for on-premise and RISE,
     * where one landscape holds several data containers. Omit (or null) for
     * products that address no client.
     */
    sapClient?: string | null;
    createdById: string;
    expiresAt?: Date | null;
  },
  /**
   * The owner gate, re-applied under the app lock with the key write: names
   * the person minting the key. Throws KeyIssuerRefused, and nothing commits.
   */
  gate?: { readonly issuerId: string },
): Promise<IssuedClient> {
  const rawToken = generateClientToken();
  const tokenHash = hashClientToken(rawToken);
  const lane = {
    organizationId: scope.organizationId,
    solutionId: input.solutionId,
    environment: input.environment,
  };
  const reason = "A key was issued for this environment.";

  const row = await prisma.$transaction(async (tx) => {
    await lockAndGate(tx, scope.organizationId, input.solutionId, gate?.issuerId);

    // Before the key changes: a link sent against the old key would otherwise
    // replace this one when it is opened.
    await closePendingClaimLinks(lane, reason, new Date(), tx);

    const previous = await tx.solutionClient.findFirst({
      where: lane,
      select: { isActive: true, revokedAt: true },
    });

    const written = await tx.solutionClient.upsert({
      // Keyed by (organization, solution, environment), never by solution alone.
      // The update branch below rotates the token hash and revives a revoked
      // credential — if the organization is not in this `where`, the only thing
      // keeping that write inside the tenant is whichever caller scoped the
      // solution lookup above it. Same reasoning, and the same shape, as
      // `upsertSapConnection`'s organizationId_product_key.
      where: {
        organizationId_solutionId_environment: {
          organizationId: scope.organizationId,
          solutionId: input.solutionId,
          environment: input.environment,
        },
      },
      create: {
        organizationId: scope.organizationId,
        solutionId: input.solutionId,
        label: input.label,
        tokenHash,
        environment: input.environment,
        sapClient: input.sapClient ?? null,
        createdById: input.createdById,
        expiresAt: input.expiresAt ?? null,
      },
      update: {
        label: input.label,
        tokenHash,
        // Rotation re-states the binding rather than preserving it: the caller
        // just described the credential it wants, and a silently-kept client
        // from a previous issue would be a binding nobody chose.
        sapClient: input.sapClient ?? null,
        expiresAt: input.expiresAt ?? null,
        // Re-issuing revives a revoked or deactivated credential deliberately:
        // the operator has just asked for a working token.
        isActive: true,
        revokedAt: null,
        // ...but not the write key that was sealed on it. See `endedCredential`.
        ...(endedCredential(previous) ? { secretsCiphertext: null } : {}),
      },
      select: { id: true, solutionId: true, label: true, environment: true, sapClient: true, createdAt: true },
    });

    // And after, in the same transaction. See `closePendingClaimLinks`.
    await closePendingClaimLinks(lane, reason, new Date(), tx);
    return written;
  });

  return { ...row, rawToken };
}

/**
 * Rotate: mint a new token for an existing client. The old one dies immediately.
 */
export async function rotateClientToken(
  scope: TenantScope,
  clientId: string,
  /** The owner gate, re-applied under the app lock — see `issueClientToken`. */
  gate?: { readonly issuerId: string },
): Promise<IssuedClient | null> {
  const located = await prisma.solutionClient.findFirst({
    where: scopedById(scope, clientId),
    select: { solutionId: true },
  });
  if (!located) return null;

  const now = new Date();
  const rawToken = generateClientToken();
  const row = await prisma.$transaction(async (tx) => {
    await lockAndGate(tx, scope.organizationId, located.solutionId, gate?.issuerId);

    // Re-read under the lock: what the rotation replaces is the row as it is now.
    const existing = await tx.solutionClient.findFirst({
      where: scopedById(scope, clientId),
      select: {
        id: true,
        solutionId: true,
        environment: true,
        isActive: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (!existing) return null;

    const lane = {
      organizationId: scope.organizationId,
      solutionId: existing.solutionId,
      environment: existing.environment,
    };
    const reason = "The key for this environment was rotated.";
    await closePendingClaimLinks(lane, reason, now, tx);

    const written = await tx.solutionClient.update({
      where: { id: existing.id, organizationId: scope.organizationId },
      data: {
        tokenHash: hashClientToken(rawToken),
        // Rotating an inactive or revoked credential brings it back — that is what
        // "give me a working token" means.
        isActive: true,
        revokedAt: null,
        // A working token cannot carry an expiry that has already passed.
        ...(hasLapsed(existing.expiresAt, now) ? { expiresAt: null } : {}),
        ...(endedCredential(existing) ? { secretsCiphertext: null } : {}),
      },
      select: { id: true, solutionId: true, label: true, environment: true, sapClient: true, createdAt: true },
    });

    // And after, in the same transaction. See `closePendingClaimLinks`.
    await closePendingClaimLinks(lane, reason, now, tx);
    return written;
  });
  if (row === null) return null;

  return { ...row, rawToken };
}

/**
 * Revoke: the credential stops working now.
 *
 * The row is KEPT rather than deleted. A revoked client is the only thing that
 * makes its audit history legible afterwards — delete it and the calls it made
 * become anonymous, which is precisely backwards for the case you revoke in.
 *
 * THE WRITE KEY GOES WITH IT. `secretsCiphertext` holds the sealed write key,
 * and it used to survive revocation: the row id never changes, so the next
 * issue, rotation or claim on this lane made the old `cew_` key verify again.
 * You revoke when a credential is taken, and the write key is taken with it.
 * Bringing writes back after a revocation needs a fresh, gated, audited
 * ISSUE_WRITE — not an accident of which row a new token landed on.
 *
 * Pending claim links for the lane are closed first, so revocation cannot be
 * undone by a link that was already out when it happened, and again after, so
 * it cannot be undone by one sent while it was being written.
 */
export async function revokeClientToken(
  scope: TenantScope,
  clientId: string,
): Promise<ClientSummary | null> {
  const located = await prisma.solutionClient.findFirst({
    where: scopedById(scope, clientId),
    select: { solutionId: true },
  });
  if (!located) return null;

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    // No owner gate: stopping a credential is never the dangerous direction.
    // The lock still orders it with every other change to this app's keys.
    await lockAndGate(tx, scope.organizationId, located.solutionId, undefined);

    const existing = await tx.solutionClient.findFirst({
      where: scopedById(scope, clientId),
      select: { id: true, solutionId: true, environment: true },
    });
    if (!existing) return null;

    const lane = {
      organizationId: scope.organizationId,
      solutionId: existing.solutionId,
      environment: existing.environment,
    };
    const reason = "The key was revoked.";
    await closePendingClaimLinks(lane, reason, now, tx);

    const revoked = await tx.solutionClient.update({
      where: { id: existing.id, organizationId: scope.organizationId },
      data: { isActive: false, revokedAt: now, secretsCiphertext: null },
      select: {
        id: true,
        solutionId: true,
        label: true,
        environment: true,
        sapClient: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    // And after, in the same transaction. See `closePendingClaimLinks`.
    await closePendingClaimLinks(lane, reason, now, tx);
    return revoked;
  });
}

/** Metadata for the UI. There is no field here that could carry a credential. */
export async function listClients(scope: TenantScope): Promise<ClientSummary[]> {
  return prisma.solutionClient.findMany({
    where: scopedWhere(scope, {}),
    select: {
      id: true,
      solutionId: true,
      label: true,
      environment: true,
      sapClient: true,
      isActive: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
