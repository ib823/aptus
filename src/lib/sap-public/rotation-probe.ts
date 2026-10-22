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
 * EVIDENCE COUNTS ONLY WHILE IT IS TRUE (review round 2). A proven read is
 * held against the new secret only while it still describes a read the
 * broker makes, on the terms P0.2's board uses: the feed's version and
 * dataset now, fresh within the lane TTL, an app that carries traffic
 * (`liveReadTarget`). The newest OK row, whatever it proved, refused correct
 * rotations on edited feeds and retired apps. And a later probe status
 * replaces the metadata proof only when it is about the credential
 * (`SETS_METADATA_PROOF_ASIDE`): a sweep's one TIMEOUT left the next typo
 * unprobed. The probe as a whole has one deadline (`probeRotation`).
 *
 * A METADATA PROOF IS ABOUT THESE SETTINGS, AND IT AGES (review round 3).
 * `lastValidatedAt` counts only when it is later than the last save on the
 * record (`lastConnectionSaveAt`): the code before wave 2 never cleared it on
 * a save, so on deploy day a row could carry an OK from secrets, settings or
 * a system it no longer has. And under ERROR or TIMEOUT a proof stands for
 * LANE_PROOF_TTL_MS, not for ever: a probe path whose $metadata has answered
 * nothing else for longer than that refused every correct rotation, and a
 * Test could not clear it.
 *
 * ONLY A CHANGED CREDENTIAL ON THE SAME SYSTEM IS PROBED (review round 1).
 * A re-save that leaves the sign-in credentials as they are (a label fix, or
 * switching writes on) has nothing to prove, and a SAP
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

import { LANE_PROOF_TTL_MS } from "@/lib/coreedge/freshness";
import { reachedDirectly } from "@/lib/governed/transport";
import { isLaneCheckedApp } from "@/lib/coreedge/lanes";
import { prisma } from "@/lib/db/prisma";
import { resolveReadDefinition } from "@/lib/northbound/read-definition";
import { readEntitySet, type NorthboundReadResult } from "@/lib/northbound/read";
import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { getSapProduct } from "@/lib/sap-public/tdd-connector";
import { fetchMetadataDocument, resolveProbePath } from "@/lib/studio/connection-health";

import type { ProbeStepResult, RotationProbe } from "./rotation";

/**
 * How long the whole probe may wait on SAP (wave 2 integration review round
 * 2). The connections route's maxDuration is set above this plus one token
 * exchange (TOKEN_REQUEST_TIMEOUT_MS) and the save's own database work, so a
 * SAP that does not answer is an audited refusal, never a platform 504.
 */
export const ROTATION_PROBE_DEADLINE_MS = 40_000;

/** Off only when the operator says so; any other value, a typo included, probes. */
export function rotationProbeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COREEDGE_ROTATION_PROBE?.trim().toLowerCase() !== "off";
}

type ExistingConnection = {
  readonly isActive?: boolean | null;
  readonly lastValidationStatus?: string | null;
  /** SapConnection.transport: a TWIN connection is never probed from here (transport.ts `reachedDirectly`). */
  readonly transport?: string | null;
} | null;

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
  // The probe sends the new credentials to the base URL with the platform's
  // own fetch; a connection served by the Tenant Twin is kept off the
  // customer's SAP, so it is saved as before (wave 2 integration review round 3).
  if (!reachedDirectly(existing)) return false;
  return existing.isActive === true && existing.lastValidationStatus !== "UNAUTHORIZED";
}

/**
 * The dataset the data-read step reads: one proven readable through this
 * connection, and exactly what was proven (wave 2 integration review round 2).
 * A proof is about one feed definition: the version and dataset it was made
 * at, read at one service path, at one time.
 */
export interface RotationReadTarget {
  /** The interface whose read proved it. */
  readonly interfaceId: string;
  /** The feed version the read was proven at: every change to its dataset or service bumps it. */
  readonly interfaceVersion: number;
  readonly servicePath: string;
  readonly entitySet: string;
  /** When the read was proven. It counts for LANE_PROOF_TTL_MS, as the lane's own evidence does. */
  readonly provenAt: Date;
}

/** What the working secret is proven to do: the facts the probe gate decides from. */
export interface RotationEvidence {
  /** It read the probe path's $metadata: a probe since the last save was OK, or the save that stored it proved it. */
  readonly metadata: boolean;
  /**
   * When that metadata proof was made, or null when there is none. A save
   * that keeps the credentials carries it forward with this time, so carrying
   * a proof never makes it fresher (wave 2 integration review round 3).
   */
  readonly metadataProvenAt: Date | null;
  /** A dataset it read: a lane's proven read, or the one the save that stored it read. */
  readonly read: RotationReadTarget | null;
}

/** A proven read as a save's audit row records it: JSON, so the time is a string. */
export interface RotationProofRead {
  readonly interfaceId: string;
  readonly interfaceVersion: number;
  readonly servicePath: string;
  readonly entitySet: string;
  readonly provenAt: string;
}

/** What a save proved about the credentials it stored (its audit row's `rotationProof`). */
export interface RotationProof {
  /** The revision the save wrote: the proof is about that revision's settings and nothing later. */
  readonly revision: number;
  readonly metadata: boolean;
  /** When the metadata proof was made (ISO), when there is one. A proof without it dates from its save's audit row. */
  readonly metadataProvenAt?: string;
  readonly read: RotationProofRead | null;
}

/** The proof a save recorded, as the next save reads it back (`carriedRotationProof`). */
export interface CarriedRotationProof {
  readonly metadata: boolean;
  /** When the carried metadata proof was made. */
  readonly metadataProvenAt: Date | null;
  readonly read: RotationReadTarget | null;
}

/**
 * A probe status that sets the earlier metadata proof aside: SAP refused the
 * secret (UNAUTHORIZED, which also turns the probe off), or the working
 * secret no longer reads the probe path's $metadata (NOT_FOUND: the
 * arrangement stopped releasing it; NO_PROBE_PATH). Demanding of the new
 * secret what the old one can no longer do would refuse a correct rotation.
 *
 * Every other status says nothing about the credential (wave 2 integration
 * review round 2): TIMEOUT and ERROR are SAP not answering, UNREADABLE and
 * GROUP_UNREADABLE are this platform not opening a sealed set (the group
 * marker is not even about this row's own secret). Under those the earlier
 * proof stands; letting one of them replace it unprotected the connection, so
 * the next typo replaced a working secret.
 */
const SETS_METADATA_PROOF_ASIDE: ReadonlySet<string> = new Set(["UNAUTHORIZED", "NOT_FOUND", "NO_PROBE_PATH"]);

/** When the evidence is judged, and when the settings it describes were last saved. */
export interface RotationEvidenceContext {
  /**
   * When the connection was last saved: the newest `connection_created` or
   * `connection_replaced` audit row (`lastConnectionSaveAt`), or null when no
   * save is on the record. `lastValidatedAt` proves something about the
   * current settings only when it is later than this. The code before wave 2
   * never cleared it on a save, so a row saved before the deploy can carry an
   * OK observed with secrets, settings or even a system it no longer has
   * (wave 2 integration review round 3).
   */
  readonly lastSavedAt?: Date | null;
  readonly now?: Date;
}

/**
 * The evidence, from the row's own probe record, the lanes' proven read and
 * the proof carried from the save that stored the secret.
 *
 * The metadata is proven when the last probe was OK, unless that OK was
 * observed before the last save on the record (wave 2 final review round 2).
 * Otherwise it is proven
 * by an earlier proof of THESE settings, still fresh, that no later status
 * set aside (`SETS_METADATA_PROOF_ASIDE`):
 *
 *   - a probe that answered OK after the last save on the record:
 *     `lastValidatedAt` (only a real 200 sets it), later than `lastSavedAt`.
 *     With no save on the record, it proves nothing;
 *   - or what the save itself proved, carried on its audit row.
 *
 * FRESH MEANS WITHIN THE LANE TTL (review round 3). A status that says nothing
 * about the credential (TIMEOUT, ERROR) keeps the proof, so a sweep's one
 * blip does not leave the next typo unprobed. But a probe path that has
 * answered nothing but ERROR or TIMEOUT for longer than LANE_PROOF_TTL_MS no
 * longer shows that the old secret reads its $metadata, and holding that
 * against a correct new secret refused the rotation for as long as the
 * failure lasted: a Test only writes ERROR again, and only a save (the thing
 * refused) moves the proof.
 */
export function rotationEvidence(
  existing: { readonly lastValidationStatus?: string | null; readonly lastValidatedAt?: Date | null },
  laneRead: RotationReadTarget | null,
  carried: CarriedRotationProof | null,
  context: RotationEvidenceContext = {},
): RotationEvidence {
  const now = context.now ?? new Date();
  const status = existing.lastValidationStatus ?? null;
  const read = laneRead ?? carried?.read ?? null;
  const validatedAt = existing.lastValidatedAt ?? null;
  const lastSavedAt = context.lastSavedAt ?? null;
  // An OK observed before the last save on the record is about settings the
  // row may no longer have (wave 2 final review round 2): the code before wave
  // 2 never cleared the status on a save, so a pre-deploy form re-save that
  // dropped the API path kept its OK. It then falls through to the rules below.
  const okBeforeLastSave =
    validatedAt !== null && lastSavedAt !== null && lastSavedAt.getTime() > validatedAt.getTime();
  if (status === "OK" && !okBeforeLastSave) return { metadata: true, metadataProvenAt: validatedAt ?? now, read };
  if (status !== null && SETS_METADATA_PROOF_ASIDE.has(status)) return { metadata: false, metadataProvenAt: null, read };
  const probedSinceSave =
    validatedAt !== null && lastSavedAt !== null && validatedAt.getTime() > lastSavedAt.getTime() ? validatedAt : null;
  const carriedAt = carried?.metadata === true ? carried.metadataProvenAt : null;
  let provenAt: Date | null = null;
  for (const at of [probedSinceSave, carriedAt]) {
    if (at === null || now.getTime() - at.getTime() > LANE_PROOF_TTL_MS) continue;
    if (provenAt === null || at.getTime() > provenAt.getTime()) provenAt = at;
  }
  return { metadata: provenAt !== null, metadataProvenAt: provenAt, read };
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

/**
 * What the working secret proved, which the new one must prove too (decideRotation's options).
 *
 * The metadata proof was made at the stored row's probe path, so it is
 * demanded of the new secret only at that same path (wave 2 final review).
 * Studio's form never pre-fills the probe path, so a rotation typed there
 * drops a stored one: the new secret was then held to a $metadata at another
 * service (S/4's default, which the arrangement may not release) or at none
 * (ECC), and a correct rotation was refused. When the path changes, the
 * metadata step is recorded but not required; the data read, when one is
 * proven, decides, as `carriedProof` already treats a moved probe path.
 */
export function rotationRequirements(
  evidence: RotationEvidence,
  options: {
    readonly probePathUnchanged?: boolean;
    /**
     * The candidate's probe path as the probe resolves it, when known. With
     * none (ECC without an API path) no metadata request can be made, so a
     * metadata proof cannot be reproduced and is never demanded (wave 2 final
     * review round 2): demanding it refused every correct rotation without a
     * call to SAP.
     */
    readonly candidateProbePath?: string | null;
  } = {},
): {
  readonly metadataRequired: boolean;
  readonly dataReadRequired: boolean;
} {
  return {
    metadataRequired:
      evidence.metadata && (options.probePathUnchanged ?? true) && options.candidateProbePath !== null,
    dataReadRequired: evidence.read !== null,
  };
}

/**
 * Whether a save keeps the path its connection's $metadata is probed at, as
 * the probe resolves it (an empty API path is the product's default service).
 * `stored` is the judged row's own plaintext columns, never the opened secret
 * set: a row whose secrets will not open (a keyring mix-up, a restore) still
 * has its API path, and taking the path as kept then held a correct form
 * rotation to the default service's $metadata (wave 2 final review round 2).
 */
export function sameProbePath(
  stored: Pick<ResolvedSapConnection, "apiPath" | "product">,
  candidate: Pick<ResolvedSapConnection, "apiPath" | "product">,
): boolean {
  return resolveProbePath(stored) === resolveProbePath(candidate);
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

function proofRead(read: RotationReadTarget): RotationProofRead {
  return {
    interfaceId: read.interfaceId,
    interfaceVersion: read.interfaceVersion,
    servicePath: read.servicePath,
    entitySet: read.entitySet,
    provenAt: read.provenAt.toISOString(),
  };
}

/**
 * The proof a passing probe gives the credentials it let through: what it
 * actually proved. Its read was proven now, by this probe.
 */
export function proofFromProbe(
  revision: number,
  probe: RotationProbe,
  read: RotationReadTarget | null,
  now: Date = new Date(),
): RotationProof | null {
  const metadata = probe.metadata?.ok === true;
  const proven = probe.dataRead?.ok === true && read ? proofRead({ ...read, provenAt: now }) : null;
  if (!metadata && !proven) return null;
  return { revision, metadata, ...(metadata ? { metadataProvenAt: now.toISOString() } : {}), read: proven };
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
  const metadataProvenAt = evidence.metadata && options.probePathUnchanged ? evidence.metadataProvenAt : null;
  const metadata = metadataProvenAt !== null;
  // Carried as proven, with the time it was proven: a save that changes
  // nothing proves nothing new, so it does not make an old read, or an old
  // metadata proof, fresh (review round 3).
  const read = evidence.read ? proofRead(evidence.read) : null;
  if (!metadata && !read) return null;
  return { revision, metadata, ...(metadataProvenAt ? { metadataProvenAt: metadataProvenAt.toISOString() } : {}), read };
}

const PROVEN_READ = ["OK", "EMPTY"];

/** At most this many recent lane rows are walked for one that still describes its feed. */
const LANE_ROWS_WALKED = 20;

/** What a proven read claims, before it is held against the feed as it is now. */
interface ReadClaim {
  readonly interfaceId: string;
  readonly interfaceVersion: number;
  readonly entitySet: string;
  readonly provenAt: Date;
  /** The service path the read was made at, when it was recorded (a save's proof); a lane row records none. */
  readonly servicePath?: string;
}

/** The feed fields a claim is held against. */
const CLAIM_FEED_SELECT = {
  id: true,
  version: true,
  status: true,
  sapProduct: true,
  externalId: true,
  entitySet: true,
  servicePath: true,
  odataVersion: true,
  solution: { select: { status: true } },
} as const;

interface ClaimFeed {
  readonly id: string;
  readonly version: number;
  readonly status: string;
  readonly sapProduct: string;
  readonly externalId: string;
  readonly entitySet: string | null;
  readonly servicePath: string | null;
  readonly odataVersion: string | null;
  readonly solution: { readonly status: string };
}

/**
 * Does this proven read still describe a read the broker makes, and if so
 * which (wave 2 integration review round 2)? It counts only while P0.2's board
 * would count the same evidence (lane-authorisation.ts `laneEvidence`,
 * freshness.ts LANE_PROOF_TTL_MS):
 *
 *   fresh     proven within LANE_PROOF_TTL_MS. The nightly sweep re-proves
 *             every lane still served, so a live lane's read stays fresh, and
 *             a row the sweep no longer refreshes (a retired app, a lapsed
 *             grant: A70) ages out instead of standing for ever;
 *   same feed the feed's version and dataset now (an edited feed is a
 *             different read: no secret was proven on the new dataset);
 *   served    the app carries traffic (ACTIVE, RESTRICTED) and the feed is
 *             not DEPRECATED, which the broker refuses;
 *   same path a recorded service path is the one the feed resolves to today.
 *
 * Anything else proves nothing about the read the new secret would make, and
 * holding it against the new secret refused correct rotations.
 */
async function liveReadTarget(claim: ReadClaim, feed: ClaimFeed | null, now: Date): Promise<RotationReadTarget | null> {
  if (now.getTime() - claim.provenAt.getTime() > LANE_PROOF_TTL_MS) return null;
  if (!feed || feed.version !== claim.interfaceVersion || feed.entitySet !== claim.entitySet) return null;
  if (feed.status === "DEPRECATED" || !isLaneCheckedApp(feed.solution.status)) return null;
  const product = getSapProduct(feed.sapProduct);
  if (!product) return null;
  const definition = await resolveReadDefinition(product, feed);
  if (!definition.ok || definition.entitySet !== claim.entitySet) return null;
  if (claim.servicePath !== undefined && definition.service.path !== claim.servicePath) return null;
  return {
    interfaceId: claim.interfaceId,
    interfaceVersion: claim.interfaceVersion,
    servicePath: definition.service.path,
    entitySet: definition.entitySet,
    provenAt: claim.provenAt,
  };
}

/**
 * The newest dataset a lane has proven readable through this connection
 * (LaneCheck) that still counts (`liveReadTarget`). Rows are walked newest
 * first, so one set aside does not hide an older one that counts. A row
 * written before checks recorded their dataset and feed version (NULL keys,
 * pre-P0.2) proves nothing here, as on the board: what it proved is not
 * known, and the next sweep stamps it.
 */
export async function provenReadTarget(
  organizationId: string,
  connectionId: string,
  now: Date = new Date(),
): Promise<RotationReadTarget | null> {
  const rows = await prisma.laneCheck.findMany({
    where: {
      organizationId,
      connectionId,
      readStatus: { in: PROVEN_READ },
      entitySet: { not: null },
      interfaceVersion: { not: null },
      readAt: { gte: new Date(now.getTime() - LANE_PROOF_TTL_MS) },
    },
    orderBy: { readAt: "desc" },
    take: LANE_ROWS_WALKED,
    select: { interfaceId: true, entitySet: true, interfaceVersion: true, readAt: true },
  });
  if (rows.length === 0) return null;
  const feeds = await prisma.interface.findMany({
    where: { organizationId, id: { in: [...new Set(rows.map((r) => r.interfaceId))] } },
    select: CLAIM_FEED_SELECT,
  });
  const byId = new Map<string, ClaimFeed>(feeds.map((f) => [f.id, f]));
  for (const row of rows) {
    if (row.entitySet === null || row.interfaceVersion === null || row.readAt === null) continue;
    const claim: ReadClaim = {
      interfaceId: row.interfaceId,
      interfaceVersion: row.interfaceVersion,
      entitySet: row.entitySet,
      provenAt: row.readAt,
    };
    const target = await liveReadTarget(claim, byId.get(row.interfaceId) ?? null, now);
    if (target) return target;
  }
  return null;
}

function parseProofRead(value: unknown): Required<ReadClaim> | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  const provenAt = typeof r.provenAt === "string" ? new Date(r.provenAt) : null;
  if (
    typeof r.interfaceId !== "string" ||
    typeof r.interfaceVersion !== "number" ||
    typeof r.servicePath !== "string" ||
    typeof r.entitySet !== "string" ||
    provenAt === null ||
    Number.isNaN(provenAt.getTime())
  ) {
    return null;
  }
  return {
    interfaceId: r.interfaceId,
    interfaceVersion: r.interfaceVersion,
    servicePath: r.servicePath,
    entitySet: r.entitySet,
    provenAt,
  };
}

function parseProof(
  after: unknown,
  revision: number,
  savedAt: Date,
): { readonly metadata: boolean; readonly metadataProvenAt: Date | null; readonly read: ReadClaim | null } | null {
  if (typeof after !== "object" || after === null) return null;
  const proof = (after as { rotationProof?: unknown }).rotationProof;
  if (typeof proof !== "object" || proof === null) return null;
  const p = proof as Record<string, unknown>;
  if (p.revision !== revision) return null;
  const metadata = p.metadata === true;
  // A proof recorded without its time dates from the save that recorded it,
  // the latest it can have been made.
  const recorded = typeof p.metadataProvenAt === "string" ? new Date(p.metadataProvenAt) : null;
  const metadataProvenAt = !metadata ? null : recorded !== null && !Number.isNaN(recorded.getTime()) ? recorded : savedAt;
  return { metadata, metadataProvenAt, read: parseProofRead(p.read) };
}

/**
 * What the save that wrote this revision proved about its credentials, read
 * back from that save's audit row. Null when it proved nothing, or recorded
 * nothing (a re-point, an unprobed save): every save bumps the revision, so a
 * proof is never read for settings it was not made with. Its read counts only
 * while it still describes the feed (`liveReadTarget`): an edited feed, a
 * retired app or an old proof is not held against the next secret.
 */
export async function carriedRotationProof(
  organizationId: string,
  connectionId: string,
  revision: number,
  now: Date = new Date(),
): Promise<CarriedRotationProof | null> {
  const audit = await prisma.configAudit.findFirst({
    where: {
      organizationId,
      entityType: "Connection",
      entityId: connectionId,
      action: { in: ["CREATE", "UPDATE"] },
      after: { path: ["rotationProof", "revision"], equals: revision },
    },
    orderBy: { at: "desc" },
    select: { after: true, at: true },
  });
  if (!audit) return null;
  const proof = parseProof(audit.after, revision, audit.at);
  if (!proof) return null;
  let read: RotationReadTarget | null = null;
  if (proof.read) {
    const feed = await prisma.interface.findFirst({
      where: { id: proof.read.interfaceId, organizationId },
      select: CLAIM_FEED_SELECT,
    });
    read = await liveReadTarget(proof.read, feed, now);
  }
  return proof.metadata || read ? { metadata: proof.metadata, metadataProvenAt: proof.metadataProvenAt, read } : null;
}

/**
 * When this connection was last saved, by the record: the newest
 * `connection_created` or `connection_replaced` audit row, which the save
 * path writes and wrote before wave 2 too. Null when none is on the record,
 * and then a `lastValidatedAt` proves nothing (`rotationEvidence`).
 */
export async function lastConnectionSaveAt(organizationId: string, connectionId: string): Promise<Date | null> {
  const audit = await prisma.configAudit.findFirst({
    where: {
      organizationId,
      entityType: "Connection",
      entityId: connectionId,
      action: { in: ["CREATE", "UPDATE"] },
      OR: [
        { after: { path: ["event"], equals: "connection_created" } },
        { after: { path: ["event"], equals: "connection_replaced" } },
      ],
    },
    orderBy: { at: "desc" },
    select: { at: true },
  });
  return audit?.at ?? null;
}

/** All the evidence the gate decides from, for the row the save replaces. */
export async function loadRotationEvidence(
  organizationId: string,
  existing: {
    readonly id: string;
    readonly revision: number;
    readonly lastValidationStatus: string | null;
    readonly lastValidatedAt: Date | null;
  },
  now: Date = new Date(),
): Promise<RotationEvidence> {
  const [laneRead, carried, lastSavedAt] = await Promise.all([
    provenReadTarget(organizationId, existing.id, now),
    carriedRotationProof(organizationId, existing.id, existing.revision, now),
    lastConnectionSaveAt(organizationId, existing.id),
  ]);
  return rotationEvidence(existing, laneRead, carried, { lastSavedAt, now });
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
 *
 * ONE DEADLINE FOR THE WHOLE PROBE (wave 2 integration review round 2). The
 * steps run in series inside the connections route, each under its own
 * timeout (metadata up to 30 s, the read up to 30 s, plus a token exchange):
 * about 70 s at worst, and a platform that cut the function off first left a
 * bare 504 with no refusal audited. Every SAP request the probe sends now
 * also stops at `deadlineMs` (ROTATION_PROBE_DEADLINE_MS), so what SAP has
 * not answered by then is a step SAP did not answer (`unavailable`), refused
 * and audited by the route like any other. The token exchange keeps its own
 * limit (TOKEN_REQUEST_TIMEOUT_MS), which the route's maxDuration also covers.
 */
export async function probeRotation(
  candidate: ResolvedSapConnection,
  read: RotationReadTarget | null,
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  options: { readonly metadataRequired?: boolean; readonly deadlineMs?: number } = {},
): Promise<RotationProbe> {
  const deadline = new AbortController();
  // abort() with no reason: the request rejects as an AbortError, which both
  // steps already classify as TIMEOUT.
  const timer = setTimeout(() => deadline.abort(), options.deadlineMs ?? ROTATION_PROBE_DEADLINE_MS);
  const bounded: typeof fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline.signal]) : deadline.signal });
  try {
    return await probeSteps(candidate, read, bounded, options.metadataRequired ?? true);
  } finally {
    clearTimeout(timer);
  }
}

async function probeSteps(
  candidate: ResolvedSapConnection,
  read: RotationReadTarget | null,
  fetchImpl: typeof fetch,
  metadataRequired: boolean,
): Promise<RotationProbe> {
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
