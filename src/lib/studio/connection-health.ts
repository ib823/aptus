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
  buildAuthHeadersFromConnection,
  TOKEN_REQUEST_TIMEOUT_MS,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";
import { publicCredentialFailure } from "@/lib/sap-public/upstream-failure";
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

/** How much of a 200 is read to decide whether it is a metadata document. */
const METADATA_SNIFF_BYTES = 8 * 1024;

/** An EDMX root element, under any namespace prefix (V2 and V4 alike). */
const EDMX_ROOT = /<(?:[A-Za-z_][\w.-]*:)?Edmx[\s>]/;

/**
 * The start of the body, no further than METADATA_SNIFF_BYTES. A real
 * $metadata document can run to megabytes and only its root element is
 * needed, so the rest of the stream is cancelled rather than read.
 */
async function bodyPrefix(res: Response): Promise<string> {
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let size = 0;
    while (size < METADATA_SNIFF_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
    await reader.cancel().catch(() => undefined);
    return text.slice(0, METADATA_SNIFF_BYTES);
  }
  // Not a stream (a test double, or an environment without one).
  return typeof res.text === "function" ? (await res.text()).slice(0, METADATA_SNIFF_BYTES) : "";
}

/**
 * WHAT THE TENANT ANSWERED, judged on more than the status (audit A21).
 *
 * Any 200 was "Reachable and authenticated" — and fetch followed redirects, so
 * the S/4HANA UI host (allowlisted, but not the -api host) answering the
 * communication user with an IdP login page or a SAML auto-post form, directly
 * or after a 302, recorded OK and moved lastValidatedAt while every real read
 * failed as invalid OData. The read path already refuses a 200 that is not
 * OData; the probe now holds the same line, because it never claims health it
 * did not observe:
 *   - a redirect to another origin is not followed, and is a sign-in that did
 *     not happen (Node answers the 3xx itself; a browser, an opaqueredirect) —
 *     a same-origin one is followed first, see followSameOrigin;
 *   - a 200 is OK only when its body is an EDMX document and is not HTML.
 *
 * `redirected` says a same-origin redirect was followed to get here. What it
 * landed on, when not metadata, is the login page the redirect was for.
 */
async function classifyResponse(
  res: Response,
  redirected: boolean,
): Promise<{ status: ConnectionHealthStatus; detail: string }> {
  const loginRedirect = {
    status: "UNAUTHORIZED",
    detail: "The tenant redirected to a login page; check that the base URL is the API host and the credentials.",
  } as const;
  if (isRedirect(res)) return loginRedirect;
  if (res.status === 200) {
    const contentType = res.headers?.get?.("content-type") ?? "";
    const metadata = !/html/i.test(contentType) && EDMX_ROOT.test(await bodyPrefix(res));
    if (!metadata) {
      if (redirected) return loginRedirect;
      return {
        status: "ERROR",
        detail: "The tenant answered 200 but not with an OData metadata document (often a login page).",
      };
    }
  }
  return classify(res.status);
}

function isRedirect(res: Response): boolean {
  return res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400);
}

/** Same-origin redirects followed before the probe stops and calls it a login redirect. */
const MAX_SAME_ORIGIN_REDIRECTS = 3;

/**
 * THE SAME HOST MOVING THE PATH IS NOT A LOGIN PAGE. Every 3xx used to be
 * "redirected to a login page", so a reverse proxy or web dispatcher that
 * answers `$metadata` with a 3xx to the real path ON ITS OWN ORIGIN — a tenant
 * the read and write paths serve, since they follow redirects — was probed
 * UNAUTHORIZED: lastValidatedAt stopped moving, the lane said SAP rejected
 * CoreEdge's sign-in, and the drift alert emailed every platform admin.
 *
 * A Location on the request's own origin is followed, a bounded number of
 * times, with the same headers, and what it lands on is classified like any
 * answer — so it is OK only as an EDMX document. A Location on another origin
 * (the IdP, the UI host), one that does not parse, or none at all, stops here
 * and is never sent the credentials.
 */
async function followSameOrigin(
  first: Response,
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<{ res: Response; redirected: boolean }> {
  const origin = new URL(url).origin;
  let res = first;
  let current = url;
  let redirected = false;
  for (let hop = 0; hop < MAX_SAME_ORIGIN_REDIRECTS && isRedirect(res); hop++) {
    const next = resolveLocation(res, current);
    if (!next || next.origin !== origin) break;
    await res.body?.cancel().catch(() => undefined);
    current = next.href;
    res = await fetchImpl(current, init);
    redirected = true;
  }
  return { res, redirected };
}

/** A redirect's Location against the URL it answered, or null when it has none that parses. */
function resolveLocation(res: Response, base: string): URL | null {
  const location = res.headers?.get?.("location");
  if (!location) return null;
  try {
    return new URL(location, base);
  } catch {
    return null;
  }
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

  // Whether the credential step finished — so a timeout names the right host
  // and the right limit: the token endpoint's, or the tenant's.
  let signedIn = false;
  try {
    // Build the header inside the try: an OAuth exchange can itself fail, and a
    // credential problem should surface as UNAUTHORIZED rather than a crash.
    const authHeaders = await buildAuthHeadersFromConnection(conn);
    signedIn = true;
    const url = buildSapUrl({ baseUrl: conn.baseUrl, path: `${path}/$metadata`, client: conn.client });
    const init: RequestInit = {
      method: "GET",
      headers: { ...authHeaders, Accept: "application/xml" },
      signal: controller.signal,
      cache: "no-store",
      redirect: "manual",
    };
    const { res, redirected } = await followSameOrigin(await fetchImpl(url, init), url, init, fetchImpl);
    const { status, detail } = await classifyResponse(res, redirected);
    return { status, httpStatus: res.status, detail, durationMs: Date.now() - started };
  } catch (err) {
    /*
     * THE ERRORS BUILT TO BE SHOWN ARE SAID OUT LOUD — SuccessFactors' own
     * sanitised answer to the token request, a signing key that cannot be
     * used, a value the assertion cannot carry, a field the connection lacks,
     * and the token endpoint's refusal of the client credentials — because
     * each is the only diagnostic Test gets. publicCredentialFailure is the
     * single place that decides it, and it also decides the status: a
     * credential that could not be used is UNAUTHORIZED, the platform admin's
     * problem, not ERROR — "SAP unavailable" — for a tenant that was never
     * called (audit A20). Every other error returns null and stays generic.
     */
    const said = publicCredentialFailure(err);
    if (said) return { ...said, durationMs: Date.now() - started };
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      status: aborted ? "TIMEOUT" : "ERROR",
      httpStatus: null,
      // Deliberately generic: the underlying error can carry the host, and in the
      // OAuth case the request body. Neither belongs in a client response.
      detail: aborted
        ? signedIn
          ? `The tenant did not respond within ${timeoutMs}ms.`
          : `The connection's token endpoint did not respond within ${TOKEN_REQUEST_TIMEOUT_MS}ms.`
        : "The connection could not be established.",
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
