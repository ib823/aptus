/**
 * Probe a re-saved connection secret against SAP before it is stored (P0.14).
 *
 * rotation.ts holds the decision, pure; this is the half that reads the
 * database and sends the one request. Nothing is written here: the candidate
 * lives in memory only, and the connections route stores it, or under
 * enforce refuses it, from what this returns.
 *
 * WHEN IT RUNS (`probeForSave`). Only when the save replaces an active,
 * directly reached connection whose stored secret works by the system's own
 * record (its last probe answered OK, or a lane proved a read through it
 * within the lane TTL), and changes the sign-in credentials on the same
 * system. Every other save is `skipped`, with the reason on its audit row,
 * and nothing is sent to SAP.
 *
 * WHAT IT SENDS. One request, the Test button's own (connection-health.ts
 * `fetchMetadataDocument`): sign in with the new credentials and read the
 * probe path's `$metadata`. At the probe path and with the timeout the row
 * will have: the save's own, or the stored one when the save leaves it out
 * (wave 2 final review round 3: a slow tenant probed with the default timeout,
 * or at another service than the stored one, answered nothing useful). The
 * whole probe stops at ROTATION_PROBE_DEADLINE_MS.
 *
 * WHAT WAS DELETED, AND WHY (wave 2 final review round 3). The probe used to
 * refuse a save whenever it could not prove the new secret did everything the
 * old one was proven to do: a data read of a dataset inferred from lane
 * checks and feed versions, a proof carried from save to save on audit rows,
 * a metadata proof that aged out after a TTL and counted only after the last
 * save on the record. Each rule refused correct rotations in a case the one
 * before missed. Under the modes in rotation.ts no refusal is inferred, so
 * none of that is needed: SAP's own answer to the new secret is the only
 * evidence a save is refused on.
 */

import { LANE_PROOF_TTL_MS } from "@/lib/coreedge/freshness";
import { prisma } from "@/lib/db/prisma";
import { reachedDirectly } from "@/lib/governed/transport";
import {
  buildAuthHeadersFromConnection,
  resolveSapConnection,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";
import { buildSapUrl } from "@/lib/sap-public/sap-url";
import { writeTargetChanges } from "@/lib/studio/connection-form";
import { fetchMetadataDocument, resolveProbePath } from "@/lib/studio/connection-health";

import {
  probeOutcome,
  rotationRefused,
  type RotationProbeMode,
  type RotationProbeRecord,
  type RotationSkipReason,
} from "./rotation";

/**
 * How long the whole probe may wait on SAP (wave 2 integration review round
 * 2). The connections route's maxDuration is set above this plus one token
 * exchange (TOKEN_REQUEST_TIMEOUT_MS) and the save's own database work, so a
 * SAP that does not answer is an audited `noAnswer`, never a platform 504.
 */
export const ROTATION_PROBE_DEADLINE_MS = 40_000;

/** The row a save replaces, as the route judged it. */
export interface RotationProbeExisting {
  readonly id: string;
  readonly revision: number;
  readonly isActive: boolean;
  readonly lastValidationStatus: string | null;
  /** SapConnection.transport: a TWIN connection is never probed from here. */
  readonly transport: string | null;
  readonly environment: string | null;
  readonly baseUrl: string;
  readonly client: string | null;
  /** The stored probe path and timeout: the probe uses them when the save leaves its own out. */
  readonly apiPath: string | null;
  readonly timeoutMs: number | null;
}

/**
 * Why the save is not probed, from the row alone, or null when it may be.
 * Asked before anything is read or sent.
 */
export function rotationProbeSkip(
  existing: Pick<RotationProbeExisting, "isActive" | "lastValidationStatus" | "transport"> | null,
  mode: RotationProbeMode,
): RotationSkipReason | null {
  if (mode === "off") return "probe_off";
  if (!existing) return "new_connection";
  if (!existing.isActive) return "deactivated";
  // The probe sends the new credentials to the base URL with the platform's
  // own fetch; a connection served by the Tenant Twin is kept off the
  // customer's SAP (wave 2 integration review round 3).
  if (!reachedDirectly(existing)) return "tenant_twin";
  if (existing.lastValidationStatus === "UNAUTHORIZED") return "last_probe_refused";
  return null;
}

/**
 * A lane has proven a read through this connection within the lane TTL. A
 * re-save drops the connection's lane checks (connection-resolver.ts
 * `upsertSapConnection`), so a row here was made with the stored settings.
 */
async function laneProvedRead(organizationId: string, connectionId: string, now: Date): Promise<boolean> {
  const row = await prisma.laneCheck.findFirst({
    where: {
      organizationId,
      connectionId,
      readStatus: { in: ["OK", "EMPTY"] },
      readAt: { gte: new Date(now.getTime() - LANE_PROOF_TTL_MS) },
    },
    select: { id: true },
  });
  return row !== null;
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

/**
 * The connection the probe sends: the candidate, at the probe path and with
 * the timeout the save gives it, or the stored ones when it gives none.
 * Only what is probed; the row saved is always exactly what the caller sent.
 */
export function probeTarget(
  candidate: ResolvedSapConnection,
  stored: Pick<RotationProbeExisting, "apiPath" | "timeoutMs">,
): ResolvedSapConnection {
  return {
    ...candidate,
    apiPath: candidate.apiPath?.trim() ? candidate.apiPath : stored.apiPath,
    timeoutMs: candidate.timeoutMs ?? stored.timeoutMs,
  };
}

/**
 * Send the new credentials to SAP once: sign in and read the probe path's
 * `$metadata`. Every request it makes also stops at `deadlineMs`: what SAP
 * has not answered by then is a timeout (`noAnswer`). The token exchange
 * keeps its own limit (TOKEN_REQUEST_TIMEOUT_MS), which the route's
 * maxDuration also covers.
 */
export async function probeRotation(
  target: ResolvedSapConnection,
  path: string,
  fetchImpl: typeof fetch = (input, init) => globalThis.fetch(input, init),
  options: { readonly deadlineMs?: number } = {},
): Promise<{ readonly answer: Pick<RotationProbeRecord, "ran" | "outcome" | "reason">; readonly detail: string }> {
  const deadline = new AbortController();
  // abort() with no reason: the request rejects as an AbortError, which
  // fetchMetadataDocument classifies as TIMEOUT.
  const timer = setTimeout(() => deadline.abort(), options.deadlineMs ?? ROTATION_PROBE_DEADLINE_MS);
  const bounded: typeof fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline.signal]) : deadline.signal });
  try {
    const result = await fetchMetadataDocument(target, path, bounded);
    return { answer: probeOutcome(result), detail: result.detail };
  } finally {
    clearTimeout(timer);
  }
}

/** What the probe found, for the save's response, its audit row and its decision. */
export interface RotationProbeResult {
  readonly record: RotationProbeRecord;
  /**
   * The probe's own sentence for the person saving (connection-health.ts
   * words it to be shown): never a secret, never on the audit row.
   */
  readonly detail: string | null;
  /** Under enforce: SAP rejected the new secret while the stored one works, so the save is refused. */
  readonly refused: boolean;
}

/** The URL fetchMetadataDocument requests can be built: the same buildSapUrl call, nothing sent. */
function probeUrlBuilds(target: ResolvedSapConnection, path: string): boolean {
  try {
    buildSapUrl({ baseUrl: target.baseUrl, path: `${path}/$metadata`, client: target.client });
    return true;
  } catch {
    return false;
  }
}

/**
 * The new key or token can travel in an HTTP header. fetch refuses a header
 * value with a character above U+00FF (a zero-width space or a typographic
 * apostrophe pasted with the key) before it opens a connection, and
 * fetchMetadataDocument would report that as SAP not answering (wave 2
 * rotation probe validation). Only the two types whose header is the secret
 * itself are checked: basic is base64, and the OAuth and SAML types send
 * what their token endpoint returns. A credential that cannot be built at all
 * is left to the probe, which already reports it as `credentials_unusable`.
 */
async function headerCarriesCredentials(target: ResolvedSapConnection): Promise<boolean> {
  if (target.authType !== "api-key" && target.authType !== "bearer") return true;
  let headers: Record<string, string>;
  try {
    headers = await buildAuthHeadersFromConnection(target);
  } catch {
    return true;
  }
  try {
    new Headers(headers);
    return true;
  } catch {
    return false;
  }
}

const UNSENDABLE_CREDENTIALS_DETAIL =
  "The new key or token holds a character an HTTP header cannot carry (often an invisible one pasted with it), so nothing was sent to SAP and no call through this connection can succeed. Retype it and save again.";

const PROBE_PATH_INVALID_DETAIL =
  `The connection's probe path cannot be joined to its base URL (a probe path starts with "/"), so nothing was sent to SAP. Correct the probe path.`;

const NO_PROBE_PATH_DETAIL =
  "This connection has no probe path, and its product has no default service to check. Add a probe path to have new credentials checked when they are saved.";

/**
 * The probe for one save attempt: skipped with its reason, or run and
 * classified. `existing` is the row the attempt judged; `candidate` is what
 * the save would store.
 */
export async function probeForSave(input: {
  readonly organizationId: string;
  readonly mode: RotationProbeMode;
  readonly existing: RotationProbeExisting | null;
  readonly candidate: ResolvedSapConnection;
  readonly fetchImpl?: typeof fetch;
  readonly now?: Date;
}): Promise<RotationProbeResult> {
  const { organizationId, mode, existing, candidate } = input;
  const skipped = (reason: RotationSkipReason, detail: string | null = null): RotationProbeResult => ({
    record: { mode, ran: false, outcome: "skipped", reason },
    detail,
    refused: false,
  });

  const early = rotationProbeSkip(existing, mode);
  if (early || !existing) return skipped(early ?? "new_connection");
  // Another host or base path, environment or SAP client: a re-point, not a rotation.
  if (writeTargetChanges(existing, candidate).length > 0) return skipped("repointed");
  const worksByRecord =
    existing.lastValidationStatus === "OK" || (await laneProvedRead(organizationId, existing.id, input.now ?? new Date()));
  if (!worksByRecord) return skipped("not_known_working");

  // The stored row as it was judged, opened to compare its credentials in
  // memory. One that will not open, or that changed since, cannot be the
  // same credentials, and is not known to work: the broker cannot open it either.
  const stored = await resolveSapConnection(organizationId, candidate.product, candidate.key).then(
    (row) => (row && row.id === existing.id && row.revision === existing.revision ? row : null),
    () => null,
  );
  if (stored && sameSignInCredentials(stored, candidate)) return skipped("credentials_unchanged");

  const target = probeTarget(candidate, existing);
  const path = resolveProbePath(target);
  if (!path) return skipped("no_probe_path", NO_PROBE_PATH_DETAIL);
  // A probe path the URL builder refuses (no leading "/": it would be joined
  // onto the hostname) fails inside the probe before any request, after a
  // token exchange for OAuth: checked here first, so nothing is sent and the
  // record never says a probe ran (wave 2 rotation probe review round 1).
  if (!probeUrlBuilds(target, path)) return skipped("probe_path_invalid", PROBE_PATH_INVALID_DETAIL);
  if (!(await headerCarriesCredentials(target))) return skipped("credentials_unusable", UNSENDABLE_CREDENTIALS_DETAIL);

  const { answer, detail } = await probeRotation(target, path, input.fetchImpl);
  const record: RotationProbeRecord = { mode, ...answer };
  return { record, detail, refused: rotationRefused(record, stored !== null) };
}
