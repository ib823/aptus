/**
 * Probe a new connection secret before it replaces a working one (P0.14).
 *
 * rotation.ts holds the DECISION, pure; this is the network half the save
 * path runs first: sign in with the candidate credentials, read the service
 * metadata, and read one row from a dataset this connection has already
 * proven readable. Nothing is written here: the candidate lives in memory
 * only, and the connections route stores it only when `decideRotation` says
 * swap. A mistyped rotated secret therefore never replaces a working one.
 *
 * WHEN IT RUNS (rotationProbeApplies). Only when the save REPLACES an active
 * connection whose secret is working by the system's own record
 * (RotationEvidence): its last probe was OK, a lane has proven a read through
 * it (LaneCheck), or the save that stored it proved one of those
 * (`carriedRotationProof`). The last probe alone is not enough evidence: a
 * nightly sweep that met one transient SAP timeout records TIMEOUT, and a
 * probe path whose $metadata is not in the communication arrangement records
 * NOT_FOUND, while the data service serves every lane. A connection SAP last
 * refused (UNAUTHORIZED) is evidence that its secret is broken, which is when
 * a secret gets rotated, so it is never probed. A new connection, a
 * deactivated one, and one with no evidence of working have nothing working
 * to protect, and save exactly as before. `COREEDGE_ROTATION_PROBE=off` turns
 * the probe off entirely (docs/runbooks/coreedge-governed-pipeline.md).
 *
 * THE PROOF SURVIVES A RE-SAVE (wave 2 integration review round 1). A re-save
 * clears the probe status and drops the connection's lane checks (P0.2,
 * connection-resolver.ts `upsertSapConnection`): they were made with the
 * settings the save replaced. That left the save AFTER any re-save with no
 * evidence, so it was not probed, and a typo there replaced a secret the
 * previous save had just proven. So each save records what the credentials it
 * stored are proven to do — by its own probe, or carried over unchanged when
 * it did not change them — on its audit row, keyed by the revision it wrote
 * (`RotationProof`). The next save reads it back for that revision only.
 *
 * ONLY A CHANGED CREDENTIAL ON THE SAME SYSTEM IS PROBED (review round 1).
 * A re-save that leaves the sign-in credentials as they are (a label fix, the
 * write secret added to switch writes on) has nothing to prove, and a SAP
 * outage is no reason to refuse it (`sameSignInCredentials`). A re-save that
 * points the connection at another system (host, environment or SAP client)
 * is a re-point, not a rotation: the old system's proof says nothing about the
 * new one, so it saves as before and carries no proof forward.
 *
 * THE NEW SECRET PROVES WHAT THE OLD ONE PROVED (rotationRequirements). The
 * metadata step is required only when the working secret read the metadata;
 * the data read only when a read has been proven. A secret is not refused for
 * a $metadata the arrangement never released to the old one either.
 *
 * WHAT COUNTS AS EACH STEP.
 *   sign-in    the credential step finished (a token was issued, a header
 *              built) and SAP did not answer 401. A basic-auth password is
 *              only ever judged by SAP's 401, so a wrong one fails here rather
 *              than as a metadata problem.
 *   metadata   the connection's probe path answered an EDMX document
 *              (connection-health.ts fetchMetadataDocument, the same request
 *              the Test button sends). With no probe path (ECC, whose
 *              product has no default service), it cannot run, and when it is
 *              not required the data read is the proof and the sign-in.
 *   data-read  one row from the dataset proven readable through THIS
 *              connection, read the way the broker reads it (read.ts). OK and
 *              EMPTY both pass. With no proven read there is nothing to
 *              compare against, and the step is not run (decideRotation's
 *              dataReadRequired).
 * A step SAP did not answer (timeout, network failure, 5xx) is marked
 * `unavailable`, so the refusal says SAP did not answer rather than blaming
 * the credential.
 */

import { prisma } from "@/lib/db/prisma";
import { resolveReadDefinition } from "@/lib/northbound/read-definition";
import { readEntitySet, type NorthboundReadResult } from "@/lib/northbound/read";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import { fetchMetadataDocument, resolveProbePath } from "@/lib/studio/connection-health";

import type { ProbeStepResult, RotationProbe } from "./rotation";

/** Off only when the operator says so; any other value, a typo included, probes. */
export function rotationProbeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COREEDGE_ROTATION_PROBE?.trim().toLowerCase() !== "off";
}

type ExistingConnection = { readonly isActive?: boolean | null; readonly lastValidationStatus?: string | null } | null;

/**
 * Could the connection being replaced be working today? The cheap half of the
 * question, asked before any evidence is looked up: an active row whose secret
 * SAP did not last refuse.
 */
export function rotationProbeMayApply(
  existing: ExistingConnection,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!existing || !rotationProbeEnabled(env)) return false;
  return existing.isActive === true && existing.lastValidationStatus !== "UNAUTHORIZED";
}

/** The dataset the data-read step reads: one proven readable through this connection. */
export interface RotationReadTarget {
  /** The interface whose read proved it: what a save's proof records. */
  readonly interfaceId: string;
  readonly servicePath: string;
  readonly entitySet: string;
}

/** What the working secret is proven to do: the facts the probe gate decides from. */
export interface RotationEvidence {
  /** It read the probe path's $metadata: its last probe was OK, or the save that stored it proved it. */
  readonly metadata: boolean;
  /** A dataset it read: a lane's proven read, or the one the save that stored it read. */
  readonly read: RotationReadTarget | null;
}

/** What a save proved about the credentials it stored (its audit row's `rotationProof`). */
export interface RotationProof {
  /** The revision the save wrote: the proof is about that revision's settings and nothing later. */
  readonly revision: number;
  readonly metadata: boolean;
  readonly readInterfaceId: string | null;
}

/**
 * The evidence, from the row's own status, the lanes' proven read and the
 * proof carried from the save that stored the secret. A probe status written
 * after that save (by a Test or the nightly sweep) is newer, and decides the
 * metadata on its own; only a status no probe has written since (null) defers
 * to the carried proof.
 */
export function rotationEvidence(
  existing: { readonly lastValidationStatus?: string | null },
  laneRead: RotationReadTarget | null,
  carried: { readonly metadata: boolean; readonly read: RotationReadTarget | null } | null,
): RotationEvidence {
  const status = existing.lastValidationStatus ?? null;
  return {
    metadata: status === "OK" || (status === null && carried?.metadata === true),
    read: laneRead ?? carried?.read ?? null,
  };
}

/** Is the connection being replaced one whose secret is working today? */
export function rotationProbeApplies(
  existing: ExistingConnection,
  evidence: RotationEvidence,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!existing || !rotationProbeMayApply(existing, env)) return false;
  return evidence.metadata || evidence.read !== null;
}

/** What the working secret proved, which the new one must prove too (decideRotation's options). */
export function rotationRequirements(evidence: RotationEvidence): {
  readonly metadataRequired: boolean;
  readonly dataReadRequired: boolean;
} {
  return { metadataRequired: evidence.metadata, dataReadRequired: evidence.read !== null };
}

/**
 * Whether a save keeps the credentials SAP signs in with: the auth type, the
 * token endpoint and every sealed secret except the write secret, which no
 * probe step uses. Compared in memory only; neither side is logged. `stored`
 * is null when the stored row could not be opened, which is never "the same".
 */
export function sameSignInCredentials(
  stored: Pick<ResolvedSapConnection, "authType" | "oauthTokenUrl" | "secrets"> | null,
  candidate: Pick<ResolvedSapConnection, "authType" | "oauthTokenUrl" | "secrets">,
): boolean {
  if (!stored) return false;
  if (stored.authType !== candidate.authType) return false;
  if ((stored.oauthTokenUrl ?? null) !== (candidate.oauthTokenUrl ?? null)) return false;
  const signIn = (secrets: ResolvedSapConnection["secrets"]) =>
    Object.entries(secrets as Record<string, unknown>)
      .filter(([name, value]) => name !== "writeSecret" && typeof value === "string" && value.length > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(signIn(stored.secrets)) === JSON.stringify(signIn(candidate.secrets));
}

/** The proof a passing probe gives the credentials it let through: what it actually proved. */
export function proofFromProbe(revision: number, probe: RotationProbe, read: RotationReadTarget | null): RotationProof | null {
  const metadata = probe.metadata?.ok === true;
  const readInterfaceId = probe.dataRead?.ok === true && read ? read.interfaceId : null;
  return metadata || readInterfaceId ? { revision, metadata, readInterfaceId } : null;
}

/**
 * The proof a save that kept the credentials carries over to the revision it
 * writes. The metadata proof was made at the probe path, so it carries only
 * while the probe path is the same.
 */
export function carriedProof(
  revision: number,
  evidence: RotationEvidence,
  options: { readonly probePathUnchanged: boolean },
): RotationProof | null {
  const metadata = evidence.metadata && options.probePathUnchanged;
  const readInterfaceId = evidence.read?.interfaceId ?? null;
  return metadata || readInterfaceId ? { revision, metadata, readInterfaceId } : null;
}

const PROVEN_READ = ["OK", "EMPTY"];

/** The dataset an interface reads, as the broker would read it; null when it cannot be resolved. */
async function readTargetForInterface(organizationId: string, interfaceId: string): Promise<RotationReadTarget | null> {
  const iface = await prisma.interface.findFirst({
    where: { id: interfaceId, organizationId },
    select: { sapProduct: true, externalId: true, entitySet: true, servicePath: true, odataVersion: true },
  });
  const product = iface ? getSapProduct(iface.sapProduct) : null;
  if (!iface || !product) return null;
  const definition = await resolveReadDefinition(product, iface);
  return definition.ok ? { interfaceId, servicePath: definition.service.path, entitySet: definition.entitySet } : null;
}

/** The newest dataset a lane has proven readable through this connection (LaneCheck). */
export async function provenReadTarget(
  organizationId: string,
  connectionId: string,
): Promise<RotationReadTarget | null> {
  const lane = await prisma.laneCheck.findFirst({
    where: { organizationId, connectionId, readStatus: { in: PROVEN_READ } },
    orderBy: { readAt: "desc" },
    select: { interfaceId: true },
  });
  return lane ? readTargetForInterface(organizationId, lane.interfaceId) : null;
}

function parseProof(after: unknown, revision: number): RotationProof | null {
  if (typeof after !== "object" || after === null) return null;
  const proof = (after as { rotationProof?: unknown }).rotationProof;
  if (typeof proof !== "object" || proof === null) return null;
  const p = proof as Record<string, unknown>;
  if (p.revision !== revision) return null;
  return {
    revision,
    metadata: p.metadata === true,
    readInterfaceId: typeof p.readInterfaceId === "string" && p.readInterfaceId.length > 0 ? p.readInterfaceId : null,
  };
}

/**
 * What the save that wrote this revision proved about its credentials, read
 * back from that save's audit row. Null when it proved nothing, or recorded
 * nothing (a re-point, an unprobed save): every save bumps the revision, so a
 * proof is never read for settings it was not made with.
 */
export async function carriedRotationProof(
  organizationId: string,
  connectionId: string,
  revision: number,
): Promise<{ readonly metadata: boolean; readonly read: RotationReadTarget | null } | null> {
  const audit = await prisma.configAudit.findFirst({
    where: {
      organizationId,
      entityType: "Connection",
      entityId: connectionId,
      action: { in: ["CREATE", "UPDATE"] },
      after: { path: ["rotationProof", "revision"], equals: revision },
    },
    orderBy: { at: "desc" },
    select: { after: true },
  });
  const proof = parseProof(audit?.after, revision);
  if (!proof) return null;
  const read = proof.readInterfaceId ? await readTargetForInterface(organizationId, proof.readInterfaceId) : null;
  return proof.metadata || read ? { metadata: proof.metadata, read } : null;
}

/** All the evidence the gate decides from, for the row the save replaces. */
export async function loadRotationEvidence(
  organizationId: string,
  existing: { readonly id: string; readonly revision: number; readonly lastValidationStatus: string | null },
): Promise<RotationEvidence> {
  const [laneRead, carried] = await Promise.all([
    provenReadTarget(organizationId, existing.id),
    carriedRotationProof(organizationId, existing.id, existing.revision),
  ]);
  return rotationEvidence(existing, laneRead, carried);
}

/** SAP did not answer: a timeout, a network failure, or a 5xx. Says nothing about a credential. */
function unanswered(status: string, httpStatus: number | null): boolean {
  return status === "TIMEOUT" || (status === "ERROR" && (httpStatus === null || httpStatus >= 500));
}

function dataReadStep(row: NorthboundReadResult): ProbeStepResult {
  if (row.status === "OK" || row.status === "EMPTY") return { step: "data-read", ok: true };
  return {
    step: "data-read",
    ok: false,
    detail: row.detail,
    ...(unanswered(row.status, row.httpStatus) ? { unavailable: true } : {}),
  };
}

/** The read refused the credential itself: SAP's 401, or a credential step that could not be used. */
function readRefusedSignIn(row: NorthboundReadResult): boolean {
  return row.httpStatus === 401 || (row.httpStatus === null && row.status === "NEEDS_SETUP");
}

/**
 * Run the three steps against the candidate. Each step runs only if the one
 * before it passed; a step that never ran is null, not a failure. The one
 * exception is a metadata step the working secret never passed
 * (`metadataRequired: false`): its failure is recorded and the data read
 * still runs, because that read is the proof the old secret had. That holds
 * when there is no probe path at all (review round 1): the read then also
 * decides the sign-in.
 */
export async function probeRotation(
  candidate: ResolvedSapConnection,
  read: RotationReadTarget | null,
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  options: { readonly metadataRequired?: boolean } = {},
): Promise<RotationProbe> {
  const metadataRequired = options.metadataRequired ?? true;
  const path = resolveProbePath(candidate);
  if (!path) {
    // No probe path: the metadata step cannot run. Said as the metadata step,
    // because no metadata request was made.
    const noPath: ProbeStepResult = {
      step: "metadata",
      ok: false,
      detail: "No probe path is configured for this connection, and this product has no default service to fall back on.",
    };
    if (metadataRequired || read === null) {
      return { signIn: { step: "sign-in", ok: true }, metadata: noPath, dataRead: null };
    }
    const row = await readEntitySet({ connection: candidate, servicePath: read.servicePath, entitySet: read.entitySet, limit: 1 }, fetchImpl);
    if (readRefusedSignIn(row)) {
      return {
        signIn: {
          step: "sign-in",
          ok: false,
          detail: row.httpStatus === 401 ? "SAP answered 401: the user, password or token was not accepted." : row.detail,
        },
        metadata: null,
        dataRead: null,
      };
    }
    return { signIn: { step: "sign-in", ok: true }, metadata: noPath, dataRead: dataReadStep(row) };
  }

  const metadata = await fetchMetadataDocument(candidate, path, fetchImpl);
  if (!metadata.signedIn || metadata.httpStatus === 401) {
    return {
      signIn: {
        step: "sign-in",
        ok: false,
        detail: metadata.signedIn ? "SAP answered 401: the user, password or token was not accepted." : metadata.detail,
      },
      metadata: null,
      dataRead: null,
    };
  }
  const metadataStep: ProbeStepResult =
    metadata.status === "OK"
      ? { step: "metadata", ok: true }
      : {
          step: "metadata",
          ok: false,
          detail: metadata.detail,
          ...(unanswered(metadata.status, metadata.httpStatus) ? { unavailable: true } : {}),
        };
  if ((!metadataStep.ok && metadataRequired) || read === null) {
    return { signIn: { step: "sign-in", ok: true }, metadata: metadataStep, dataRead: null };
  }

  const row = await readEntitySet({ connection: candidate, servicePath: read.servicePath, entitySet: read.entitySet, limit: 1 }, fetchImpl);
  return { signIn: { step: "sign-in", ok: true }, metadata: metadataStep, dataRead: dataReadStep(row) };
}
