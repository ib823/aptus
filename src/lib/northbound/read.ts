/**
 * Reading SAP through a CLIENT'S OWN connection.
 *
 * WHY NOT REUSE previewSapEntitySet: it takes an `envPrefix` and builds its
 * Authorization header from environment variables — the single shared demo
 * tenant. Pointing it at a stored connection would read a DIFFERENT SAP system
 * and return those rows under this client's token. One customer would be served
 * another's data, which is the worst failure this platform could have. So the
 * broker reads through the keystone resolver instead, exactly as the Connections
 * probe does.
 *
 * What it does NOT re-invent is honest status. The classification below is the
 * same contract the whole console uses: a 200 with zero rows is a successful
 * read of an empty resource — data — and stays distinct from "not set up"
 * (401/403) and from a failure (5xx/timeout).
 */

import {
  buildAuthHeadersFromConnection,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";
import { bodyPrefix } from "@/lib/sap-public/body-prefix";
import { buildSapUrl } from "@/lib/sap-public/sap-url";
import { stripODataEnvelope } from "@/lib/sap-public/odata-envelope";
import {
  credentialStepOutcome,
  FAILURE_REASON_INVALID_BODY,
  failureReasonFromError,
  failureReasonFromHttp,
} from "@/lib/northbound/failure-reason";
import type { NorthboundReadStatus } from "@/lib/northbound/read-status";

// The status vocabulary and its HTTP/code tables live in a pure module, so the
// fixture builder can share them without importing the connection resolver.
export { httpStatusFor, northboundErrorCodeFor, type NorthboundReadStatus } from "@/lib/northbound/read-status";

export interface NorthboundReadResult {
  status: NorthboundReadStatus;
  httpStatus: number | null;
  records: Record<string, unknown>[];
  /** Safe for a client: never a URL, header, credential or upstream body. */
  detail: string;
  durationMs: number;
  /**
   * WHY it failed, as a bounded code for the audit row and the server log —
   * null on success. Never sent to the client; `detail` is what they see.
   * See failure-reason.ts for the shape and the reason it exists.
   */
  failureReason: string | null;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_LIMIT = 100;
/**
 * The most of a read's body that is read, in DECODED bytes. The body was read
 * whole before, and fetch inflates before reading, so a builder's own host
 * answering ~0.4 MB of gzip that expands to hundreds of MB could take a shared
 * instance down with two reads at once (consolidated review round 1). Past it
 * the stream is cancelled and the read is an invalid body, said as too large.
 *
 * 16 MiB, NOT a per-row allowance. It was 100 x 32 KiB = 3.125 MiB, and wide
 * rows (a SuccessFactors Photo or Attachment, any binary or long-text
 * property: the broker sends no $select) pass that at a high limit. Such a
 * read was served before the bound, and cut at it the ERROR counted against
 * SAP: a circuit upstream-error, a refused rotation probe, a failing lane
 * proof (P1 on wave 2 integration review round 1). 16 MiB is above the
 * ~4.5 MB a Vercel function can return, so nothing a deployment serves is
 * cut, and it still caps a bomb far below a 2 GB instance.
 */
export const MAX_READ_BODY_BYTES = 16 * 1024 * 1024;

/** OData v2 nests rows under `d.results`; v4 puts them in `value`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/*
 * The rows leave here without SAP's envelope. Every V2 row carries
 * `__metadata.uri` and a `__deferred.uri` per navigation, every V4 row its
 * `@odata.*` links, and all of them are absolute URLs on the connection's host —
 * the host the broker exists to keep from the caller. See odata-envelope.ts.
 */
function extractRecords(json: unknown): Record<string, unknown>[] | null {
  const rows = extractRawRecords(json);
  return rows === null ? null : rows.map(stripODataEnvelope);
}

function extractRawRecords(json: unknown): Record<string, unknown>[] | null {
  if (!isRecord(json) || "error" in json) return null;
  const v4 = (json as { value?: unknown }).value;
  if ("value" in json) return Array.isArray(v4) && v4.every(isRecord) ? v4 : null;
  const d = json.d;
  if (!isRecord(d) || "error" in d) return null;
  if ("results" in d) {
    return Array.isArray(d.results) && d.results.every(isRecord) ? d.results : null;
  }
  // A v2 single-entity response is `d` itself.
  return [d];
}

function classify(httpStatus: number, records: Record<string, unknown>[]): {
  status: NorthboundReadStatus;
  detail: string;
} {
  if (httpStatus === 200) {
    return records.length === 0
      ? {
          status: "EMPTY",
          // Said explicitly because this is the distinction consumers get wrong:
          // an empty resource is a result, not a fault.
          detail: "No records. The service answered successfully and has nothing to return.",
        }
      : { status: "OK", detail: `${records.length} record${records.length === 1 ? "" : "s"}.` };
  }
  /*
   * 401 AND 403 ARE DIFFERENT PROBLEMS WITH DIFFERENT FIXES. They shared one
   * sentence, so a wrong communication-user password read exactly like a
   * missing communication arrangement, and a consultant chasing the wrong one
   * lost the afternoon. Both stay NEEDS_SETUP — the status vocabulary is about
   * the capability on the tenant, and neither is a fault in the capability —
   * but the detail now says which half of the connection to look at.
   */
  if (httpStatus === 401) {
    return {
      status: "NEEDS_SETUP",
      detail:
        "The tenant rejected the connection's credentials (HTTP 401). The communication user's password or token is wrong or expired — a connection problem, not a missing arrangement.",
    };
  }
  if (httpStatus === 403) {
    return {
      status: "NEEDS_SETUP",
      detail:
        "The tenant refused this read (HTTP 403): the communication arrangement is not set up, or this entity is not released to the connected user.",
    };
  }
  if (httpStatus === 404) {
    return { status: "NOT_FOUND", detail: "The requested entity set does not exist on this tenant." };
  }
  return { status: "ERROR", detail: `The tenant responded with HTTP ${httpStatus}.` };
}

export interface ReadEntitySetInput {
  connection: ResolvedSapConnection;
  /** OData service path, e.g. /sap/opu/odata/sap/API_BUSINESS_PARTNER. */
  servicePath: string;
  entitySet: string;
  limit: number;
}

/**
 * Read one entity set through a resolved connection.
 *
 * Bounded by an AbortController: a hung tenant fails the request rather than
 * holding a server thread until something else times out.
 *
 * `fetchImpl` and `authHeadersFor` are the transport (governed/transport.ts):
 * the credential step is network too (a token exchange), so a transport that
 * must not reach the network replaces both.
 */
export async function readEntitySet(
  input: ReadEntitySetInput,
  fetchImpl: typeof fetch = fetch,
  authHeadersFor: (connection: ResolvedSapConnection) => Promise<Record<string, string>> = buildAuthHeadersFromConnection,
): Promise<NorthboundReadResult> {
  const started = Date.now();
  const { connection } = input;
  const limit = Math.min(Math.max(input.limit, 1), MAX_LIMIT);
  const timeoutMs = Math.min(connection.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    /*
     * THE CREDENTIAL STEP HAS ITS OWN CATCH (audit A08). It shared the one
     * below, so a token endpoint refusing a rotated client secret, an expired
     * SuccessFactors assertion or a row missing its password came back as 502
     * UPSTREAM_ERROR / FETCH_FAILED — retried by every app following the guide,
     * each retry hitting the customer's token endpoint with the bad credential
     * again — though the tenant was never called. A credential that could not
     * be used is NEEDS_SETUP, as SAP's own 401 is; only the token endpoint
     * failing is ERROR, and its timeout is TIMEOUT naming its own limit.
     */
    let authHeaders: Record<string, string>;
    try {
      authHeaders = await authHeadersFor(connection);
    } catch (err) {
      const { status, detail, failureReason } = credentialStepOutcome(err);
      return { status, httpStatus: null, records: [], detail, durationMs: Date.now() - started, failureReason };
    }
    const url = buildSapUrl({
      baseUrl: connection.baseUrl,
      path: `${input.servicePath}/${encodeURIComponent(input.entitySet)}`,
      client: connection.client,
      query: { $top: limit, $format: "json" },
    });

    const res = await fetchImpl(url, {
      method: "GET",
      headers: { ...authHeaders, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    // Parse defensively: an SAP error page is frequently HTML or XML, and
    // JSON.parse throwing on it would surface as a generic crash rather than as
    // the honest status the response code already told us.
    let json: unknown = null;
    const { text, truncated } = await bodyPrefix(res, MAX_READ_BODY_BYTES);
    if (truncated) {
      return {
        status: "ERROR", httpStatus: res.status, records: [],
        detail: `The tenant's response is larger than ${MAX_READ_BODY_BYTES / (1024 * 1024)} MB, so it was not read. Ask for fewer records.`,
        durationMs: Date.now() - started,
        failureReason: FAILURE_REASON_INVALID_BODY,
      };
    }
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    const records = res.status === 200 ? extractRecords(json) : [];
    if (records === null) {
      return {
        status: "ERROR", httpStatus: res.status, records: [],
        detail: "The tenant returned an invalid OData response.",
        durationMs: Date.now() - started,
        failureReason: FAILURE_REASON_INVALID_BODY,
      };
    }
    const { status, detail } = classify(res.status, records);
    return {
      status,
      httpStatus: res.status,
      records,
      detail,
      durationMs: Date.now() - started,
      failureReason: failureReasonFromHttp(res.status),
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      status: aborted ? "TIMEOUT" : "ERROR",
      httpStatus: null,
      records: [],
      // Deliberately generic: the caught error commonly carries the host, and on
      // the OAuth path the request itself. Neither belongs in a client response.
      detail: aborted
        ? `The tenant did not respond within ${timeoutMs}ms.`
        : "The read could not be completed.",
      durationMs: Date.now() - started,
      // The cause is NOT thrown away any more — it is reduced to a code that
      // cannot carry a host, for the audit row and the log. See failure-reason.ts.
      failureReason: failureReasonFromError(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
