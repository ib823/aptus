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
 * connection whose secret is working by the system's own record: its last
 * probe was OK, or a lane has proven a read through it (LaneCheck). The last
 * probe alone is not enough evidence: a nightly sweep that met one transient
 * SAP timeout records TIMEOUT, and a probe path whose $metadata is not in the
 * communication arrangement records NOT_FOUND, while the data service serves
 * every lane. A connection SAP last refused (UNAUTHORIZED) is evidence that
 * its secret is broken, which is when a secret gets rotated, so it is never
 * probed. A new connection, a deactivated one, and one with no evidence of
 * working have nothing working to protect, and save exactly as before.
 * `COREEDGE_ROTATION_PROBE=off` turns the probe off entirely
 * (docs/runbooks/coreedge-governed-pipeline.md).
 *
 * THE NEW SECRET PROVES WHAT THE OLD ONE PROVED (rotationRequirements). The
 * metadata step is required only when the last probe read the metadata (OK);
 * the data read only when a lane has proven one. A secret is not refused for
 * a $metadata the arrangement never released to the old one either.
 *
 * WHAT COUNTS AS EACH STEP.
 *   sign-in    the credential step finished (a token was issued, a header
 *              built) and SAP did not answer the metadata request 401. A
 *              basic-auth password is only ever judged by SAP's 401, so a
 *              wrong one fails here rather than as a metadata problem.
 *   metadata   the connection's probe path answered an EDMX document
 *              (connection-health.ts fetchMetadataDocument, the same request
 *              the Test button sends).
 *   data-read  one row from the newest dataset a lane has proven readable
 *              through THIS connection (LaneCheck), read the way the broker
 *              reads it (read.ts). OK and EMPTY both pass. With no proven
 *              read there is nothing to compare against, and the step is not
 *              run (decideRotation's dataReadRequired).
 */

import { prisma } from "@/lib/db/prisma";
import { resolveReadDefinition } from "@/lib/northbound/read-definition";
import { readEntitySet } from "@/lib/northbound/read";
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
 * question, asked before any lane is looked up: an active row whose secret SAP
 * did not last refuse.
 */
export function rotationProbeMayApply(
  existing: ExistingConnection,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!existing || !rotationProbeEnabled(env)) return false;
  return existing.isActive === true && existing.lastValidationStatus !== "UNAUTHORIZED";
}

/**
 * Is the connection being replaced one whose secret is working today? Its last
 * probe read OK, or a lane has proven a read through it (`provenRead`, from
 * provenReadTarget).
 */
export function rotationProbeApplies(
  existing: ExistingConnection,
  provenRead: RotationReadTarget | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!existing || !rotationProbeMayApply(existing, env)) return false;
  return existing.lastValidationStatus === "OK" || provenRead !== null;
}

/** What the working secret proved, which the new one must prove too (decideRotation's options). */
export function rotationRequirements(
  existing: { readonly lastValidationStatus?: string | null },
  provenRead: RotationReadTarget | null,
): { readonly metadataRequired: boolean; readonly dataReadRequired: boolean } {
  return { metadataRequired: existing.lastValidationStatus === "OK", dataReadRequired: provenRead !== null };
}

/** The dataset the data-read step reads: the newest one proven readable through this connection. */
export interface RotationReadTarget {
  readonly servicePath: string;
  readonly entitySet: string;
}

const PROVEN_READ = ["OK", "EMPTY"];

export async function provenReadTarget(
  organizationId: string,
  connectionId: string,
): Promise<RotationReadTarget | null> {
  const lane = await prisma.laneCheck.findFirst({
    where: { organizationId, connectionId, readStatus: { in: PROVEN_READ } },
    orderBy: { readAt: "desc" },
    select: { interfaceId: true },
  });
  if (!lane) return null;
  const iface = await prisma.interface.findFirst({
    where: { id: lane.interfaceId, organizationId },
    select: { sapProduct: true, externalId: true, entitySet: true, servicePath: true, odataVersion: true },
  });
  const product = iface ? getSapProduct(iface.sapProduct) : null;
  if (!iface || !product) return null;
  const definition = await resolveReadDefinition(product, iface);
  return definition.ok ? { servicePath: definition.service.path, entitySet: definition.entitySet } : null;
}

/**
 * Run the three steps against the candidate. Each step runs only if the one
 * before it passed; a step that never ran is null, not a failure. The one
 * exception is a metadata step the working secret never passed
 * (`metadataRequired: false`): its failure is recorded and the data read
 * still runs, because that read is the proof the old secret had.
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
    // No probe path: nothing can prove the candidate. Said as the metadata
    // step, because the sign-in was never tried against SAP.
    return {
      signIn: { step: "sign-in", ok: true },
      metadata: {
        step: "metadata",
        ok: false,
        detail: "No probe path is configured for this connection, and this product has no default service to fall back on.",
      },
      dataRead: null,
    };
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
    metadata.status === "OK" ? { step: "metadata", ok: true } : { step: "metadata", ok: false, detail: metadata.detail };
  if ((!metadataStep.ok && metadataRequired) || read === null) {
    return { signIn: { step: "sign-in", ok: true }, metadata: metadataStep, dataRead: null };
  }

  const row = await readEntitySet({ connection: candidate, servicePath: read.servicePath, entitySet: read.entitySet, limit: 1 }, fetchImpl);
  return {
    signIn: { step: "sign-in", ok: true },
    metadata: metadataStep,
    dataRead:
      row.status === "OK" || row.status === "EMPTY"
        ? { step: "data-read", ok: true }
        : { step: "data-read", ok: false, detail: row.detail },
  };
}
