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
  buildAuthHeaderFromConnection,
  type ResolvedSapConnection,
} from "@/lib/sap-public/connection-resolver";

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
  /** The created record, when SAP returned one. */
  record: Record<string, unknown> | null;
  /** SAP's Location header — the identity of what was created. */
  location: string | null;
  /** Safe for a client: never a URL, header, credential, or raw upstream body. */
  detail: string;
  durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_TIMEOUT_MS = 45_000;

function classify(httpStatus: number): { status: NorthboundWriteStatus; detail: string } {
  if (httpStatus === 201 || httpStatus === 200) {
    return { status: "CREATED", detail: "The record was created." };
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      status: "NEEDS_SETUP",
      detail:
        "The tenant rejected the write: the communication arrangement does not permit it, or the connected user lacks authorisation.",
    };
  }
  if (httpStatus === 404) {
    return { status: "NOT_FOUND", detail: "The target entity set does not exist on this tenant." };
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

function extractRecord(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;
  const d = (json as { d?: unknown }).d;
  if (d && typeof d === "object" && !Array.isArray(d)) return d as Record<string, unknown>;
  return json as Record<string, unknown>;
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
 * retry cannot reach this function twice for the same intent.
 */
export async function writeEntitySet(
  input: WriteEntitySetInput,
  fetchImpl: typeof fetch = fetch,
): Promise<NorthboundWriteResult> {
  const started = Date.now();
  const { connection } = input;
  const timeoutMs = Math.min(connection.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const base = `${connection.baseUrl}${input.servicePath}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const authorization = await buildAuthHeaderFromConnection(connection);

    // 1 — CSRF handshake against the service root, with the same credentials.
    const csrfRes = await fetchImpl(`${base}/`, {
      method: "GET",
      headers: { Authorization: authorization, Accept: "application/json", "X-CSRF-Token": "Fetch" },
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
      };
    }

    const headers: Record<string, string> = {
      Authorization: authorization,
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    };
    const cookie = csrfRes.headers.get("set-cookie");
    if (cookie) headers.Cookie = cookie;

    // 2 — the write itself.
    const res = await fetchImpl(`${base}/${encodeURIComponent(input.entitySet)}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input.payload),
      signal: controller.signal,
      cache: "no-store",
    });

    let json: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    const { status, detail } = classify(res.status);
    return {
      status,
      httpStatus: res.status,
      record: status === "CREATED" ? extractRecord(json) : null,
      location: res.headers.get("location"),
      detail,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      status: aborted ? "TIMEOUT" : "ERROR",
      httpStatus: null,
      record: null,
      location: null,
      // Deliberately generic: the caught error carries the host, and on the OAuth
      // path the request body. Neither belongs in a client response.
      detail: aborted
        ? // Said explicitly because a timed-out WRITE is genuinely ambiguous —
          // the record may or may not exist. The idempotency key is what makes
          // the retry safe.
          `The tenant did not respond within ${timeoutMs}ms. The write may or may not have been applied — retry with the SAME Idempotency-Key to find out safely.`
        : "The write could not be completed.",
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
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
