/**
 * Read-only connectivity probe for a stored SapConnection.
 *
 * WHY THIS EXISTS INSTEAD OF REUSING /api/sap/tdd/capabilities: that route
 * resolves its tenant from the `{PREFIX}_*` ENV vars. Pointing it at a stored
 * connection would probe a DIFFERENT SAP system and report the result against
 * this row — a connection could be shown healthy on the strength of someone
 * else's tenant answering. That is precisely the kind of fabricated status the
 * honest-status contract exists to prevent, so this probe resolves the row's own
 * baseUrl and credentials through the keystone resolver.
 *
 * Properties that matter:
 *   - READ-ONLY. A single GET against an OData `$metadata` document. It never
 *     writes, and it is not a data read (no business records are fetched).
 *   - Secrets stay server-side. The decrypted bundle is used to build one
 *     Authorization header and is never returned, logged, or attached to the
 *     result.
 *   - Bounded. An AbortController timeout means a hung SAP system fails the probe
 *     instead of hanging the request.
 *   - Honest outcomes. 401/403 ("not set up") and 5xx/timeout ("unreachable")
 *     stay distinct, because they are different problems with different fixes.
 */

import {
  buildAuthHeaderFromConnection,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";
import { getSapProduct, getSapServices } from "@/lib/sap-public/tdd-connector";
import { buildSapUrl } from "@/lib/sap-public/sap-url";

export type ConnectionHealthStatus =
  | "OK"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "ERROR"
  | "NO_PROBE_PATH";

export interface ConnectionHealthResult {
  status: ConnectionHealthStatus;
  /** HTTP status actually observed, when the request completed. */
  httpStatus: number | null;
  /** Safe, non-secret explanation for the UI. Never contains a URL or credential. */
  detail: string;
  /** Wall-clock duration of the probe, for the "how slow is this tenant" question. */
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

/**
 * The path to probe: the connection's explicit `apiPath` if set, else the first
 * curated service for its product. If neither exists we refuse to guess — a
 * fabricated path would return 404 and be reported as "not found in this
 * tenant", which reads as a tenant problem when it is really our ignorance.
 */
export function resolveProbePath(conn: Pick<ResolvedSapConnection, "apiPath" | "product">): string | null {
  if (conn.apiPath && conn.apiPath.trim().length > 0) return conn.apiPath.trim();
  const product = getSapProduct(conn.product);
  // Through getSapServices so the 2608 PO legacy flag decides which PO path
  // a connection without an explicit apiPath is probed with.
  const first = product ? getSapServices(product)[0]?.path : undefined;
  return first ?? null;
}

function classify(httpStatus: number): { status: ConnectionHealthStatus; detail: string } {
  if (httpStatus === 200) {
    return { status: "OK", detail: "Reachable and authenticated." };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      status: "UNAUTHORIZED",
      detail:
        "Reachable, but the credentials were rejected or the communication arrangement is not set up.",
    };
  }
  if (httpStatus === 404) {
    return {
      status: "NOT_FOUND",
      detail: "Reachable, but the probed service does not exist on this tenant.",
    };
  }
  return { status: "ERROR", detail: `The tenant responded with HTTP ${httpStatus}.` };
}

export async function probeConnection(
  conn: ResolvedSapConnection,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectionHealthResult> {
  const started = Date.now();
  const path = resolveProbePath(conn);
  if (!path) {
    return {
      status: "NO_PROBE_PATH",
      httpStatus: null,
      detail:
        "No probe path is configured for this connection, and this product has no default service to fall back on.",
      durationMs: 0,
    };
  }

  const timeoutMs = Math.min(conn.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Build the header inside the try: an OAuth exchange can itself fail, and a
    // credential problem should surface as UNAUTHORIZED rather than a crash.
    const authorization = await buildAuthHeaderFromConnection(conn);
    const res = await fetchImpl(
      buildSapUrl({ baseUrl: conn.baseUrl, path: `${path}/$metadata`, client: conn.client }),
      {
        method: "GET",
        headers: { Authorization: authorization, Accept: "application/xml" },
        signal: controller.signal,
        cache: "no-store",
      },
    );
    const { status, detail } = classify(res.status);
    return { status, httpStatus: res.status, detail, durationMs: Date.now() - started };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      status: aborted ? "TIMEOUT" : "ERROR",
      httpStatus: null,
      // Deliberately generic: the underlying error can carry the host, and in the
      // OAuth case the request body. Neither belongs in a client response.
      detail: aborted
        ? `The tenant did not respond within ${timeoutMs}ms.`
        : "The connection could not be established.",
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
