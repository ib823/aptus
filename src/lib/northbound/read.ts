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
  buildAuthHeaderFromConnection,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";

export type NorthboundReadStatus =
  | "OK"
  | "EMPTY"
  | "NEEDS_SETUP"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "ERROR";

export interface NorthboundReadResult {
  status: NorthboundReadStatus;
  httpStatus: number | null;
  records: Record<string, unknown>[];
  /** Safe for a client: never a URL, header, credential or upstream body. */
  detail: string;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_LIMIT = 100;

/** OData v2 nests rows under `d.results`; v4 puts them in `value`. */
function extractRecords(json: unknown): Record<string, unknown>[] {
  if (!json || typeof json !== "object") return [];
  const v4 = (json as { value?: unknown }).value;
  if (Array.isArray(v4)) return v4 as Record<string, unknown>[];
  const v2 = (json as { d?: { results?: unknown } }).d?.results;
  if (Array.isArray(v2)) return v2 as Record<string, unknown>[];
  // A v2 single-entity response is `d` itself.
  const d = (json as { d?: unknown }).d;
  if (d && typeof d === "object" && !Array.isArray(d)) return [d as Record<string, unknown>];
  return [];
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
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      status: "NEEDS_SETUP",
      detail:
        "The tenant rejected the request: the communication arrangement is not set up, or this entity is not released to the connected user.",
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
 */
export async function readEntitySet(
  input: ReadEntitySetInput,
  fetchImpl: typeof fetch = fetch,
): Promise<NorthboundReadResult> {
  const started = Date.now();
  const { connection } = input;
  const limit = Math.min(Math.max(input.limit, 1), MAX_LIMIT);
  const timeoutMs = Math.min(connection.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const authorization = await buildAuthHeaderFromConnection(connection);
    const url =
      `${connection.baseUrl}${input.servicePath}/${encodeURIComponent(input.entitySet)}` +
      `?$top=${limit}&$format=json`;

    const res = await fetchImpl(url, {
      method: "GET",
      headers: { Authorization: authorization, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    // Parse defensively: an SAP error page is frequently HTML or XML, and
    // JSON.parse throwing on it would surface as a generic crash rather than as
    // the honest status the response code already told us.
    let json: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    const records = res.status === 200 ? extractRecords(json) : [];
    const { status, detail } = classify(res.status, records);
    return { status, httpStatus: res.status, records, detail, durationMs: Date.now() - started };
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
    };
  } finally {
    clearTimeout(timer);
  }
}

/** The HTTP status the BROKER returns for each honest outcome. */
export function httpStatusFor(status: NorthboundReadStatus): number {
  switch (status) {
    case "OK":
    case "EMPTY":
      // An empty resource is a successful read. Returning 404 here would be the
      // single most damaging lie the broker could tell a consumer.
      return 200;
    case "NEEDS_SETUP":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "TIMEOUT":
      return 504;
    case "ERROR":
      return 502;
  }
}
