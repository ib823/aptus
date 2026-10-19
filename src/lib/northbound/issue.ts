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
 */

import { randomBytes } from "crypto";

import { prisma } from "@/lib/db/prisma";
import { CLIENT_TOKEN_PREFIX, hashClientToken } from "@/lib/northbound/auth";
import { scopedById, scopedWhere, type TenantScope } from "@/lib/studio/tenant-scope";

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
 * CLOSED BEFORE THE KEY CHANGES, by every caller, so a failure between the
 * two writes leaves the safe state: a dead link and an unchanged key, never a
 * changed key with a live link still aimed at it. A claim racing this is
 * refused by its own compare-and-set on the same row.
 *
 * AND CLOSED AGAIN AFTER IT. The close and the key write are separate
 * statements, and a link sent from CoreEdge between them passed the first
 * close, was stamped after it, and slipped both claim-time backstops: an
 * upsert onto an existing row and a rotation keep the row's createdAt, so
 * KEY_ISSUED_SINCE never fires, and a revocation is stamped before its own
 * close, so KEY_REVOKED reads the link as sent after it. Opened later, that
 * link replaced the new key or undid the revocation. The second close shuts
 * it. A link sent after the second close was sent against the key as it now
 * stands, which is a deliberate re-key and is left alone.
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
 * The second close, after the key is written: BEST-EFFORT, never a failure.
 *
 * By the time it runs the key has changed, and the caller is about to show the
 * new token once — its only copy — and write the audit row. Failing here
 * would lose both over a backstop for a link that is almost never there, and
 * leave a working key nobody holds. The first close, before the write, is the
 * one that must succeed; this one is logged and passed over.
 */
async function closeAgainAfterKeyWrite(lane: ClaimLinkLane, reason: string): Promise<void> {
  try {
    await closePendingClaimLinks(lane, reason);
  } catch (err) {
    console.error("[issue] claim-link close after key write failed", {
      organizationId: lane.organizationId,
      solutionId: lane.solutionId,
      environment: lane.environment,
      error: err instanceof Error ? err.name : "unknown",
    });
  }
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
): Promise<IssuedClient> {
  const rawToken = generateClientToken();
  const tokenHash = hashClientToken(rawToken);
  const lane = {
    organizationId: scope.organizationId,
    solutionId: input.solutionId,
    environment: input.environment,
  };

  // Before the key changes: a link sent against the old key would otherwise
  // replace this one when it is opened.
  const reason = "A key was issued for this environment.";
  await closePendingClaimLinks(lane, reason);

  const previous = await prisma.solutionClient.findFirst({
    where: lane,
    select: { isActive: true, revokedAt: true },
  });

  const row = await prisma.solutionClient.upsert({
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

  // And after: a link sent between the close and the upsert. See `closePendingClaimLinks`.
  await closeAgainAfterKeyWrite(lane, reason);

  return { ...row, rawToken };
}

/**
 * Rotate: mint a new token for an existing client. The old one dies immediately.
 */
export async function rotateClientToken(
  scope: TenantScope,
  clientId: string,
): Promise<IssuedClient | null> {
  const existing = await prisma.solutionClient.findFirst({
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

  const now = new Date();
  const lane = {
    organizationId: scope.organizationId,
    solutionId: existing.solutionId,
    environment: existing.environment,
  };
  const reason = "The key for this environment was rotated.";
  await closePendingClaimLinks(lane, reason, now);

  const rawToken = generateClientToken();
  const row = await prisma.solutionClient.update({
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

  // And after: a link sent between the close and the update. See `closePendingClaimLinks`.
  await closeAgainAfterKeyWrite(lane, reason);

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
  const existing = await prisma.solutionClient.findFirst({
    where: scopedById(scope, clientId),
    select: { id: true, solutionId: true, environment: true },
  });
  if (!existing) return null;

  const now = new Date();
  const lane = {
    organizationId: scope.organizationId,
    solutionId: existing.solutionId,
    environment: existing.environment,
  };
  const reason = "The key was revoked.";
  await closePendingClaimLinks(lane, reason, now);

  const revoked = await prisma.solutionClient.update({
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

  // And after: a link sent between the close and the update. See `closePendingClaimLinks`.
  await closeAgainAfterKeyWrite(lane, reason);

  return revoked;
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
