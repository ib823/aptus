/**
 * Writing to a CLIENT'S OWN SAP connection.
 *
 * The same reason the read path needed its own executor: `createSapEntitySetRecord`
 * takes an `envPrefix` and builds its Authorization header from environment
 * variables — the single shared demo tenant. Using it here would POST a
 * customer's record into a DIFFERENT SAP system. For a read that would be a data
 * leak; for a write it would be a data leak that also creates a record where it
 * does not belong, in a system nobody is expecting it.
 *
 * OData v2 requires a CSRF token, fetched from the service root with the same
 * credentials and replayed with its session cookie. That handshake is repeated
 * here against the resolved connection rather than the env one.
 */

import {
  buildAuthHeadersFromConnection,
  TOKEN_REQUEST_TIMEOUT_MS,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";
import { bodyPrefix } from "@/lib/sap-public/body-prefix";
import { buildSapUrl } from "@/lib/sap-public/sap-url";
import { extractCookies } from "@/lib/sap-public/cookies";
import { stripODataEnvelope } from "@/lib/sap-public/odata-envelope";
import {
  credentialStepOutcome,
  FAILURE_REASON_INVALID_BODY,
  failureReasonFromError,
  failureReasonFromHttp,
  tokenEndpointAnswer,
  wrongTokenUrlAnswer,
} from "@/lib/northbound/failure-reason";

export type NorthboundWriteStatus =
  | "CREATED"
  | "NEEDS_SETUP"
  | "NOT_FOUND"
  | "REJECTED"
  | "TIMEOUT"
  | "ERROR";

export interface NorthboundWriteResult {
  status: NorthboundWriteStatus;
  httpStatus: number | null;
  /** The created record, when SAP returned one — without SAP's envelope. */
  record: Record<string, unknown> | null;
  /**
   * The identity of what was created: SAP's Location header reduced to the
   * part after the service root, e.g. `/A_BusinessPartner('1000123')`. Never a
   * host — see entityPathFromLocation. Null when SAP sent none, or sent one
   * that is not under this connection's service root.
   */
  location: string | null;
  /** Safe for a client: never a URL, header, credential, or raw upstream body. */
  detail: string;
  durationMs: number;
  /**
   * WHY it failed, as a bounded code for the audit row and the server log —
   * null on success. Never sent to the client. Same shape as the read path, so
   * the audit column means one thing whichever route wrote it.
   */
  failureReason: string | null;
  /**
   * FALSE WHEN SAP CANNOT HAVE CREATED ANYTHING FOR THIS CALL: the POST was
   * never sent (the connection's credential could not be used, or the CSRF
   * handshake was refused, failed or timed out), or SAP declined to process it
   * at all (408, 429). TRUE once a POST that SAP may have acted on was sent.
   *
   * The route decides the Idempotency-Key's fate on it. An attempted write's
   * outcome is stored and replayed to every retry under the key — that is what
   * stops a retry creating a second record. An unattempted one is RELEASED.
   * Storing it froze a failure that never touched the record for the key's
   * whole 24 hours, and the only way past it was a new key: exactly the
   * duplicate the key exists to prevent, whenever an earlier attempt under the
   * same intent had in fact committed.
   */
  attempted: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 45_000;
/**
 * The most of a write's answer that is read, in decoded bytes: one record is
 * a few KB. Read whole before, a builder's own host could answer a small
 * compressed body that inflates past the instance's memory (read.ts,
 * MAX_READ_BODY_BYTES). Past it the body counts as one that is not JSON.
 */
export const MAX_WRITE_RESPONSE_BYTES = 1024 * 1024;

/**
 * Statuses with which SAP, or BTP API Management in front of it, declines to
 * process a request at all — so the record was certainly not created.
 */
const NOT_PROCESSED = new Set([408, 429]);

/*
 * WHAT A RETRY OF AN AMBIGUOUS WRITE ACTUALLY GETS. The outcome is stored
 * under the key, so a retry with the same key is answered with this same
 * response, without contacting SAP, until the key expires. The old advice —
 * "retry with the SAME Idempotency-Key to find out" — promised a re-check
 * that never happens, and an integration that gave up on the frozen answer
 * moved to a new key: a second record, if the first had committed.
 */
const AMBIGUOUS_RETRY =
  "Retrying with this Idempotency-Key returns this same answer until the key expires: check SAP for the record before writing it again under a new key.";

function classify(httpStatus: number): { status: NorthboundWriteStatus; detail: string } {
  if (httpStatus === 201 || httpStatus === 200) {
    return { status: "CREATED", detail: "The record was created." };
  }
  // 401 and 403 are told apart for the same reason as on the read path: a bad
  // password and a missing arrangement are fixed in different places.
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
        "The tenant refused the write (HTTP 403): the communication arrangement does not permit it, or the connected user lacks authorisation.",
    };
  }
  if (httpStatus === 404) {
    return { status: "NOT_FOUND", detail: "The target entity set does not exist on this tenant." };
  }
  /*
   * 408 AND 429 ARE NOT A BAD PAYLOAD. The tenant throttled the request, or
   * gave up waiting for it, and did not process it. They fell into the 4xx
   * branch below and went out as 422 VALIDATION_ERROR "check the field
   * values" — conventionally do-not-retry, and a data problem that does not
   * exist. Same answer as the read executor, which already calls them ERROR.
   */
  if (NOT_PROCESSED.has(httpStatus)) {
    return {
      status: "ERROR",
      detail: `The tenant throttled or timed out the request (HTTP ${httpStatus}), so the record was not created. Retry later with the same Idempotency-Key.`,
    };
  }
  if (httpStatus >= 400 && httpStatus < 500) {
    // SAP validation failure — the caller's payload is wrong. Distinct from a
    // permissions problem, because the fix is completely different.
    return {
      status: "REJECTED",
      detail: `The tenant rejected the payload (HTTP ${httpStatus}). Check the field values against the interface contract.`,
    };
  }
  return { status: "ERROR", detail: `The tenant responded with HTTP ${httpStatus}.` };
}

/*
 * The record leaves without SAP's envelope, for the same reason as on the read
 * path: V2's `__metadata.uri` and `__deferred.uri`, and V4's `@odata.*` links,
 * are absolute URLs on the connection's host. A write is worse than a read
 * here, because the route stores the envelope and replays it to every retry
 * under the same Idempotency-Key for a day. See odata-envelope.ts.
 */
function extractRecord(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== "object" || Array.isArray(json) || "error" in json) return null;
  const d = (json as { d?: unknown }).d;
  if ("d" in json) {
    return d && typeof d === "object" && !Array.isArray(d) && !("error" in d)
      ? stripODataEnvelope(d as Record<string, unknown>) : null;
  }
  return stripODataEnvelope(json as Record<string, unknown>);
}

/**
 * SAP's Location header, reduced to what identifies the record and nothing
 * that addresses SAP.
 *
 * SAP Gateway sends Location as an ABSOLUTE URL on the tenant's own host —
 * `https://<tenant>:443/sap/opu/odata/sap/<SERVICE>/<Set>('<key>')`, often with
 * `sap-client` echoed into the query. Passed through, every successful create
 * handed the caller the hostname, the service path and the client, even on a
 * 201 that carried no body at all. Through the broker that URL is useless; its
 * only use is to call SAP directly.
 *
 * What remains is the path after the service root. A Location that is not on
 * the connection's origin, or not under this service, cannot be shown to name
 * what this call created, so it yields null rather than a guess.
 */
function entityPathFromLocation(
  raw: string | null,
  connection: ResolvedSapConnection,
  servicePath: string,
): string | null {
  if (!raw) return null;
  let root: URL;
  let url: URL;
  try {
    // No client: the root is only resolved against, and the query is dropped.
    root = new URL(
      buildSapUrl({ baseUrl: connection.baseUrl, path: `${servicePath.replace(/\/+$/, "")}/` }),
    );
    url = new URL(raw, root);
  } catch {
    return null;
  }
  if (url.origin !== root.origin) return null;
  // SAP Gateway resolves service names case-insensitively and echoes them as it
  // pleases, so the prefix is matched the same way. Only what follows it is
  // kept, so a lenient comparison cannot let a host or a query through.
  if (!url.pathname.toLowerCase().startsWith(root.pathname.toLowerCase())) return null;
  const rest = url.pathname.slice(root.pathname.length);
  return rest === "" ? null : `/${rest}`;
}

export interface WriteEntitySetInput {
  connection: ResolvedSapConnection;
  servicePath: string;
  entitySet: string;
  payload: Record<string, unknown>;
}

/**
 * Create one record through a resolved connection.
 *
 * NOTE this performs a CSRF fetch followed by the POST — two upstream calls. The
 * idempotency reservation is taken by the CALLER before either happens, so a
 * retry cannot reach this function twice for an intent SAP may have acted on.
 * It can after a call that returned `attempted: false`, because the caller
 * releases the key for exactly those — nothing was written to protect.
 *
 * `fetchImpl` and `authHeadersFor` are the transport, as on the read
 * (read.ts readEntitySet).
 */
export async function writeEntitySet(
  input: WriteEntitySetInput,
  fetchImpl: typeof fetch = fetch,
  authHeadersFor: (connection: ResolvedSapConnection) => Promise<Record<string, string>> = buildAuthHeadersFromConnection,
): Promise<NorthboundWriteResult> {
  const started = Date.now();
  const { connection } = input;
  const timeoutMs = Math.min(connection.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  /*
   * The client is applied to BOTH calls below. A CSRF handshake against one
   * client followed by a POST to another would be refused by SAP at best and
   * accepted against the wrong data container at worst — which is the whole
   * reason the URL is built in one place.
   *
   * A FUNCTION, NOT A STRING. Both calls append a suffix, so a prebuilt base
   * carrying `?sap-client=100` would yield `...?sap-client=100/` — a query
   * followed by a path, which is not a URL. The client has to be applied after
   * the suffix, every time.
   */
  const sapUrl = (suffix: string) =>
    buildSapUrl({
      baseUrl: connection.baseUrl,
      path: `${input.servicePath}${suffix}`,
      client: connection.client,
    });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Set the moment the POST is handed to fetch. Everything that fails before
  // it is known not to have touched the record — see `attempted`.
  let postSent = false;

  try {
    /*
     * The credential step has its own catch, for the read path's reason (audit
     * A08): a credential that could not be used is NEEDS_SETUP, not a 502 for
     * a tenant that was never called. On a write it matters twice over — a
     * token timeout landed in the catch below and was told "the write may or
     * may not have been applied", when nothing had been sent anywhere.
     */
    let authHeaders: Record<string, string>;
    try {
      authHeaders = await authHeadersFor(connection);
    } catch (err) {
      return credentialFailure(err, started);
    }

    // 1 — CSRF handshake against the service root, with the same credentials.
    const csrfRes = await fetchImpl(sapUrl("/"), {
      method: "GET",
      headers: { ...authHeaders, Accept: "application/json", "X-CSRF-Token": "Fetch" },
      signal: controller.signal,
      cache: "no-store",
    });
    const csrfToken = csrfRes.headers.get("x-csrf-token");

    if (!csrfRes.ok || !csrfToken) {
      // A refused handshake is usually a permissions problem, and reporting it
      // as a generic error would send the caller looking in the wrong place.
      const { status, detail } = classify(csrfRes.status === 200 ? 403 : csrfRes.status);
      return {
        status,
        httpStatus: csrfRes.status,
        record: null,
        location: null,
        detail: csrfToken ? detail : `${detail} (the tenant did not issue a CSRF token)`,
        durationMs: Date.now() - started,
        // A 200 that withheld the token is its own failure, not an HTTP_200.
        failureReason: csrfRes.ok && !csrfToken ? "NO_CSRF_TOKEN" : failureReasonFromHttp(csrfRes.status),
        // The POST was never sent, whatever the handshake said.
        attempted: false,
      };
    }

    const headers: Record<string, string> = {
      ...authHeaders,
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    };
    const cookie = extractCookies(csrfRes.headers);
    if (cookie) headers.Cookie = cookie;

    // 2 — the write itself.
    postSent = true;
    const res = await fetchImpl(sapUrl(`/${encodeURIComponent(input.entitySet)}`), {
      method: "POST",
      headers,
      body: JSON.stringify(input.payload),
      signal: controller.signal,
      cache: "no-store",
    });

    let json: unknown = null;
    let text: string;
    let truncated = false;
    try {
      ({ text, truncated } = await bodyPrefix(res, MAX_WRITE_RESPONSE_BYTES));
    } catch (err) {
      /*
       * SAP HAS ALREADY ANSWERED; only the body was lost — the timeout fired
       * mid-read, or the stream dropped. The status line is the outcome: a
       * 201 is a created record, and every non-2xx is classified from its
       * status alone. Treating this as an unanswered call reported an
       * OBSERVED success as an ambiguous timeout. A 200 is the exception: it
       * is only a create when its body says so (see below), so without one
       * the outcome genuinely is unknown.
       */
      if (res.status === 200) throw err;
      text = "";
    }
    // A body past the bound is read as one that is not JSON: a 201 or 200
    // with it is an invalid write response (below), anything else its status.
    if (text && !truncated) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    const { status, detail } = classify(res.status);
    const record = status === "CREATED" ? extractRecord(json) : null;
    // A 201 with no representation is valid. A nonempty malformed body, or
    // an empty 200 (often a login proxy), cannot establish the claimed result.
    if (status === "CREATED" && record === null && (text.trim() !== "" || res.status !== 201)) {
      return {
        status: "ERROR", httpStatus: res.status, record: null, location: null,
        detail: `The tenant returned an invalid write response, so the write may have been applied. ${AMBIGUOUS_RETRY}`,
        durationMs: Date.now() - started,
        failureReason: FAILURE_REASON_INVALID_BODY,
        attempted: true,
      };
    }
    return {
      status,
      httpStatus: res.status,
      record,
      location: entityPathFromLocation(res.headers.get("location"), connection, input.servicePath),
      detail,
      durationMs: Date.now() - started,
      failureReason: failureReasonFromHttp(res.status),
      attempted: !NOT_PROCESSED.has(res.status),
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      status: aborted ? "TIMEOUT" : "ERROR",
      httpStatus: null,
      record: null,
      location: null,
      failureReason: failureReasonFromError(err),
      // Deliberately generic: the caught error carries the host, and on the OAuth
      // path the request body. Neither belongs in a client response.
      //
      // WHICH SIDE OF THE POST IT FAILED ON is the whole difference. Before it,
      // nothing was written and the key is released, so the same key really
      // does retry. After it, the write is genuinely ambiguous and the outcome
      // is stored — and the text says what a retry will actually get.
      detail: !postSent
        ? aborted
          ? `The tenant did not answer the CSRF handshake within ${timeoutMs}ms, so the write was never sent and nothing was created. Retry with the same Idempotency-Key.`
          : "The CSRF handshake with the tenant failed, so the write was never sent and nothing was created. Retry with the same Idempotency-Key."
        : aborted
          ? `The tenant did not respond within ${timeoutMs}ms after the write was sent, so it may or may not have been applied. ${AMBIGUOUS_RETRY}`
          : "The write could not be completed.",
      durationMs: Date.now() - started,
      attempted: postSent,
    };
  } finally {
    clearTimeout(timer);
  }
}

/*
 * THE CREDENTIAL FAILED BEFORE ANYTHING WAS SENT. A rotated OAuth client
 * secret, a refused SAML exchange, a missing password, an API-key header the
 * validator now rejects, the SuccessFactors Basic-auth sunset: each throws from
 * buildAuthHeadersFromConnection. Built inside the request's try, each landed in
 * its catch as a 502 "could not be completed" with FETCH_FAILED — counted by the
 * upstream-errors incident as the tenant's answer though the tenant was never
 * contacted, and stored under the key for a day. It is the problem this module
 * already calls NEEDS_SETUP when SAP itself answers 401, fixed in the same
 * place: the connection, in Studio.
 *
 * A token endpoint that does not answer in time stays a TIMEOUT, but says whose
 * timeout it was. The old text blamed the tenant, and quoted the WRITE timeout
 * for an exchange that has its own.
 *
 * AN OUTAGE IS NOT A REFUSAL. NEEDS_SETUP is for what only a fix to the
 * connection cures: a field it lacks, a key that cannot sign, a header the
 * validator rejects, the Basic-auth sunset, a token endpoint that refused the
 * credential itself, or a token URL that answers without a token (a 404, a
 * login page). An identity provider answering 408, 429 or 5xx, or not
 * reachable at all, is briefly unwell — and called NEEDS_SETUP it
 * went out as 403 FORBIDDEN "fix the connection", the code the developer
 * fixtures teach as "not set up", so a client branching on it dropped or
 * escalated the write mid-outage while the read path called the same outage a
 * 502. It is ERROR again, as on the read path. Every branch is still
 * attempted=false: the key is released, and the retry each one asks for really
 * does write.
 *
 * WHERE THE LINE FALLS, and the failureReason, are credentialStepOutcome's —
 * the read path's own — so a read and a write through the same broken
 * connection cannot be told different things. Only the words are the write's:
 * a write must also say what a retry under its key will do.
 */
function credentialFailure(err: unknown, started: number): NorthboundWriteResult {
  const { status, failureReason } = credentialStepOutcome(err);
  const unsent = {
    status,
    httpStatus: null,
    record: null,
    location: null,
    durationMs: Date.now() - started,
    failureReason,
    attempted: false,
  } as const;
  // Every detail below is generic for the same reason as the catch above: the
  // error names the connection, and on the OAuth path can carry the token
  // endpoint. The status a token endpoint answered is a number, and is safe.
  if (status === "TIMEOUT") {
    return {
      ...unsent,
      detail: `The connection's token endpoint did not respond within ${TOKEN_REQUEST_TIMEOUT_MS}ms, so nothing was sent to the tenant. The write was not applied. Retry with the same Idempotency-Key.`,
    };
  }
  if (status === "ERROR") {
    const answered = tokenEndpointAnswer(err);
    return {
      ...unsent,
      detail:
        answered !== null
          ? `The connection's token endpoint answered HTTP ${answered} without issuing a token, so nothing was sent to the tenant. The write was not applied. Retry later with the same Idempotency-Key.`
          : "The connection's token endpoint could not be reached, so nothing was sent to the tenant. The write was not applied. Retry later with the same Idempotency-Key.",
    };
  }
  // A token URL that answers, but not with a token, is not cured by a retry:
  // "Retry later" sent a client round that loop until its key expired.
  const wrongUrl = wrongTokenUrlAnswer(err);
  return {
    ...unsent,
    detail:
      wrongUrl !== null
        ? `The connection's token endpoint answered HTTP ${wrongUrl} without issuing a token, so nothing was sent to the tenant. The write was not applied. Check the connection's token URL in Studio, then retry with the same Idempotency-Key.`
        : "The connection's credentials could not be used (a credential is missing, or the token endpoint refused it), so nothing was sent to the tenant. The write was not applied. Fix the connection in Studio, then retry with the same Idempotency-Key.",
  };
}

/** The HTTP status the BROKER returns for each write outcome. */
export function writeHttpStatusFor(status: NorthboundWriteStatus): number {
  switch (status) {
    case "CREATED":
      return 201;
    case "NEEDS_SETUP":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "REJECTED":
      // The caller's payload was wrong — a 4xx they can fix, not a 5xx to retry.
      return 422;
    case "TIMEOUT":
      return 504;
    case "ERROR":
      return 502;
  }
}
