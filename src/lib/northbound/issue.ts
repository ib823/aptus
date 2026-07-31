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
 * Issue the runtime credential for a solution.
 *
 * One client per solution in v1 (enforced by a unique constraint), so calling
 * this twice ROTATES rather than accumulating credentials — a solution with four
 * live tokens is four things to leak and four things to remember to revoke.
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

  const row = await prisma.solutionClient.upsert({
    // Keyed by (organization, solution), never by solution alone. The update
    // branch below rotates the token hash and revives a revoked credential —
    // if the organization is not in this `where`, the only thing keeping that
    // write inside the tenant is whichever caller scoped the solution lookup
    // above it. Same reasoning, and the same shape, as
    // `upsertSapConnection`'s organizationId_product_key.
    where: {
      organizationId_solutionId: {
        organizationId: scope.organizationId,
        solutionId: input.solutionId,
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
      environment: input.environment,
      // Rotation re-states the binding rather than preserving it: the caller
      // just described the credential it wants, and a silently-kept client
      // from a previous issue would be a binding nobody chose.
      sapClient: input.sapClient ?? null,
      expiresAt: input.expiresAt ?? null,
      // Re-issuing revives a revoked or deactivated credential deliberately:
      // the operator has just asked for a working token.
      isActive: true,
      revokedAt: null,
    },
    select: { id: true, solutionId: true, label: true, environment: true, sapClient: true, createdAt: true },
  });

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
    select: { id: true },
  });
  if (!existing) return null;

  const rawToken = generateClientToken();
  const row = await prisma.solutionClient.update({
    where: { id: existing.id, organizationId: scope.organizationId },
    data: {
      tokenHash: hashClientToken(rawToken),
      // Rotating an inactive or revoked credential brings it back — that is what
      // "give me a working token" means.
      isActive: true,
      revokedAt: null,
    },
    select: { id: true, solutionId: true, label: true, environment: true, sapClient: true, createdAt: true },
  });

  return { ...row, rawToken };
}

/**
 * Revoke: the credential stops working now.
 *
 * The row is KEPT rather than deleted. A revoked client is the only thing that
 * makes its audit history legible afterwards — delete it and the calls it made
 * become anonymous, which is precisely backwards for the case you revoke in.
 */
export async function revokeClientToken(
  scope: TenantScope,
  clientId: string,
): Promise<ClientSummary | null> {
  const existing = await prisma.solutionClient.findFirst({
    where: scopedById(scope, clientId),
    select: { id: true },
  });
  if (!existing) return null;

  return prisma.solutionClient.update({
    where: { id: existing.id, organizationId: scope.organizationId },
    data: { isActive: false, revokedAt: new Date() },
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
