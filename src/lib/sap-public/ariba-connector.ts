/**
 * SAP Ariba connector — REST/OAuth2, NOT OData.
 *
 * Ariba APIs differ from S/4HANA & SuccessFactors: JSON/REST, OAuth2
 * client-credentials for a bearer token, an `apiKey` header on every
 * call, and a realm-scoped `realm` query param. There is no `$metadata`
 * to discover entity sets, so instead of an entity explorer we expose a
 * curated, catalog-driven set of endpoints and preview their JSON.
 *
 * All configuration comes from ARIBA_* env (see .env.example). The
 * endpoint catalog below is a sensible starting set for Sourcing +
 * Supplier and Reporting — paths/versions vary by region and the Ariba
 * developer portal, so treat them as editable data, not gospel. The
 * mechanism (token → apiKey → realm → GET → JSON preview) is the durable
 * part; add or correct endpoints freely.
 *
 * TRUTHFUL BY CONSTRUCTION (roadmap P0.6, audit A71-A75), as a holding fix
 * until P5.3 moves Ariba onto the REST adapter. The catalogue lists the paths
 * the call sends to; a malformed realm configuration is an error, not "no
 * realms"; an unknown endpoint key, a realm the deployment does not configure
 * and a limit that is not a positive integer are the caller's 400, refused
 * before any token exchange (parseAribaCallRequest); and a token endpoint
 * that fails says so, with its status, instead of a JSON parse error.
 */
import { isCredentialRefusal } from "./oauth-saml-bearer";
import { OAuthTokenRequestError, credentialFailure, publicCredentialFailure } from "./upstream-failure";

export interface AribaEndpoint {
  key: string;
  label: string;
  group: string;
  path: string;
  description: string;
  /**
   * Set only when ARIBA_SOURCING_V1 swapped in a deprecated v1 path, so the
   * explorer can say the row is not the catalogue's default.
   */
  pinnedLegacy?: true;
}

export interface AribaRealm {
  key: string;
  label: string;
}

export interface AribaCallResult {
  endpoint: string;
  ok: boolean;
  status: number;
  durationMs: number;
  rows: Array<Record<string, unknown>>;
  fields: string[];
  nextPageToken: string | null;
  error: string | null;
  /**
   * How far the call got. "token": the OAuth exchange failed, so no request
   * was sent to the realm and `status` is 0. "request": the realm was asked,
   * and `status` is what it answered (0 if it never answered).
   */
  stage: "token" | "request";
  /**
   * A bounded code for a failed token step, in the broker's TOKEN_* vocabulary
   * (credentialFailure in upstream-failure.ts): TOKEN_REJECTED, TOKEN_HTTP_503,
   * TOKEN_NO_TOKEN and so on. Null when the token step succeeded.
   */
  failureReason: string | null;
}

/*
 * 2608 WS8 — the two sourcing endpoints moved from v1 to v2.
 *
 * The Hub marks `sourcing_event` 1.0.0 and `sourcing_project_management` 1.0.0
 * DEPRECATED, and publishes `sourcing_event_v2` 2.0.0 and
 * `sourcing_project_management_v2` 2.0.0 ACTIVE in the same package. Both are
 * the same API family under a new major version, so the migration is the
 * version segment.
 *
 * WHAT IS EVIDENCED AND WHAT IS NOT. The states, versions and artefact ids
 * above come from the harvested Hub catalogue and are checked on every run by
 * `pnpm sap:connectors:recon`. The **resource paths** under v2 are not: the
 * Hub catalogue carries no base path, and no Ariba tenant is reachable from
 * this repository, so `/prod/events` and `/prod/projects` are carried across
 * unchanged on the assumption that a major version bump kept its collections.
 * That assumption is untested. `ARIBA_SOURCING_V1=true` restores the v1 paths
 * for one release so a live tenant that disagrees is a flag flip and not a
 * deploy — the same escape hatch WS4 gave the PO connector.
 */
const ARIBA_SOURCING_V1_ENV = "ARIBA_SOURCING_V1";

/** True while a deployment is pinned to the deprecated v1 sourcing APIs. */
/**
 * Just the shape these helpers read: a bag of optional strings. Narrower than
 * `NodeJS.ProcessEnv`, which requires NODE_ENV and so forced every caller —
 * tests included — to hand over a full environment to check one flag.
 */
type EnvLike = Partial<Record<string, string | undefined>>;

export function isAribaSourcingV1Pinned(env: EnvLike = process.env): boolean {
  return env[ARIBA_SOURCING_V1_ENV] === "true";
}

// Starter catalog — Sourcing + Supplier and Reporting families.
export const ARIBA_ENDPOINTS: AribaEndpoint[] = [
  {
    key: "sourcing-events",
    label: "Sourcing Events",
    group: "Sourcing + Supplier",
    path: "/api/sourcing-eventmanagement/v2/prod/events",
    description: "RFx / sourcing events managed in Ariba Sourcing (Event Management API 2.0.0).",
  },
  {
    key: "sourcing-projects",
    label: "Sourcing Projects",
    group: "Sourcing + Supplier",
    path: "/api/sourcing-projectmanagement/v2/prod/projects",
    description: "Sourcing project workspaces and their status (Sourcing Project Management API 2.0.0).",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    group: "Sourcing + Supplier",
    path: "/api/supplierdatapagination/v4/prod/vendors",
    description: "Supplier master data (paginated Supplier Data API).",
  },
  {
    key: "contracts",
    label: "Contract Workspaces",
    group: "Sourcing + Supplier",
    path: "/api/contract-workspace/v1/prod/workspaces",
    description: "Contract workspaces in Ariba Contracts.",
  },
  {
    key: "analytical-views",
    label: "Analytical Reporting — Views",
    group: "Reporting",
    path: "/api/analytics-reporting-view/v1/prod/views",
    description: "Available analytical report view templates.",
  },
  /*
   * 2608 WS8 — "operational reporting" was one endpoint and two APIs.
   *
   * `/api/operational-reporting-view/v1` named no single Hub artefact: the Hub
   * publishes `sourcing_reporting_view` 1.0.0 and
   * `procurement_reporting_view_v2` 2.0.0 as separate ACTIVE APIs, and the v1
   * procurement API (`procurement_eventstatus`) is DEPRECATED. A single
   * endpoint could not be checked against the Hub, and silently pointed at
   * whichever the tenant happened to route. Split so each half names the
   * artefact it depends on and the procurement half pins v2.
   */
  {
    key: "sourcing-reporting-views",
    label: "Operational Reporting — Sourcing Views",
    group: "Reporting",
    path: "/api/sourcing-reporting-view/v1/prod/views",
    description: "Operational report view templates for Sourcing.",
  },
  {
    key: "procurement-reporting-views",
    label: "Operational Reporting — Procurement Views",
    group: "Reporting",
    path: "/api/procurement-reporting-view/v2/prod/views",
    description: "Operational report view templates for Procurement (v2; v1 is deprecated).",
  },
];

/**
 * The deprecated v1 paths, kept only for `ARIBA_SOURCING_V1=true`. Listed
 * rather than computed so that grepping for the deprecated path finds it.
 *
 * Each carries its own description (audit A71): the swapped entry used to
 * keep the v2 one, so the explorer labelled v1 data "Event Management API
 * 2.0.0" and an operator could record v2 as verified when it never answered.
 */
const ARIBA_SOURCING_V1_PATHS: Readonly<Record<string, { path: string; description: string }>> = {
  "sourcing-events": {
    path: "/api/sourcing-eventmanagement/v1/prod/events",
    description:
      "RFx / sourcing events managed in Ariba Sourcing (Event Management API 1.0.0, deprecated; pinned by ARIBA_SOURCING_V1).",
  },
  "sourcing-projects": {
    path: "/api/sourcing-projectmanagement/v1/prod/projects",
    description:
      "Sourcing project workspaces and their status (Sourcing Project Management API 1.0.0, deprecated; pinned by ARIBA_SOURCING_V1).",
  },
};

/**
 * The endpoints as this deployment will actually call them. The catalogue
 * route lists these, never ARIBA_ENDPOINTS, so what the explorer shows is what
 * the call route sends to.
 */
export function resolveAribaEndpoints(env: EnvLike = process.env): AribaEndpoint[] {
  if (!isAribaSourcingV1Pinned(env)) return ARIBA_ENDPOINTS;
  return ARIBA_ENDPOINTS.map((e) => {
    const legacy = ARIBA_SOURCING_V1_PATHS[e.key];
    return legacy ? { ...e, ...legacy, pinnedLegacy: true as const } : e;
  });
}

export const ARIBA_PRODUCT = {
  key: "ariba",
  label: "SAP Ariba",
  description: "SAP Ariba — Sourcing, Supplier & Reporting REST APIs.",
} as const;

export function getAribaEndpoint(key: string): AribaEndpoint | null {
  return resolveAribaEndpoints().find((e) => e.key === key) ?? null;
}

/** Configured when we have at least a base URL + api key + a token source. */
export function isAribaConfigured(): boolean {
  return Boolean(
    process.env.ARIBA_BASE_URL &&
      process.env.ARIBA_API_KEY &&
      process.env.ARIBA_OAUTH_TOKEN_URL &&
      process.env.ARIBA_CLIENT_ID &&
      process.env.ARIBA_CLIENT_SECRET,
  );
}

export function isAribaPublicAccessEnabled(): boolean {
  const raw = process.env.ARIBA_PUBLIC_ACCESS;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

/**
 * ARIBA_REALMS_JSON cannot be read (audit A72). Its message names the variable
 * and what is wrong with it, never the value or the parser's own words, which
 * quote the input.
 */
export class AribaRealmConfigError extends Error {
  constructor(reason: string) {
    super(`ARIBA_REALMS_JSON is invalid: ${reason}`);
    this.name = "AribaRealmConfigError";
  }
}

/**
 * The realms this deployment serves: ARIBA_REALMS_JSON when set, else the
 * single ARIBA_REALM, else none.
 *
 * THROWS AribaRealmConfigError for a malformed ARIBA_REALMS_JSON, and does not
 * fall back to ARIBA_REALM when it does: the variable that was set is the one
 * the operator meant. A broken list read as "no realms" (the catalogue
 * swallowed the error) left an empty picker and sent requests with no realm.
 * An entry with neither a key nor a label cannot name a realm, so it is an
 * error too, not a made-up "realm-1"; a label alone still derives a key, as it
 * always has.
 */
export function getAribaRealms(): AribaRealm[] {
  const json = process.env.ARIBA_REALMS_JSON;
  if (json) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json) as unknown;
    } catch {
      throw new AribaRealmConfigError("it is not valid JSON");
    }
    if (!Array.isArray(parsed)) {
      throw new AribaRealmConfigError("it must be a JSON array of {key, label} objects");
    }
    return parsed.map((r: unknown, i) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        throw new AribaRealmConfigError(`entry ${i + 1} is not an object`);
      }
      const rec = r as Record<string, unknown>;
      const key = typeof rec.key === "string" ? rec.key.trim() : "";
      const label = typeof rec.label === "string" ? rec.label.trim() : "";
      if (!key && !label) {
        throw new AribaRealmConfigError(`entry ${i + 1} has neither a key nor a label`);
      }
      return {
        key: key || label.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
        label: label || key,
      };
    });
  }
  const single = process.env.ARIBA_REALM;
  if (!single) return [];
  return [{ key: single, label: process.env.ARIBA_REALM_LABEL ?? single }];
}

/**
 * ARIBA_REALM_ALLOWLIST: `enforce` (the default, and any value but `off`)
 * refuses a call naming a realm the deployment does not configure; `off`
 * restores the old pass-through for a caller that relied on naming other
 * realms. A malformed ARIBA_REALMS_JSON is refused either way: that is a broken
 * configuration, not a policy.
 */
export function isAribaRealmAllowlistEnforced(env: EnvLike = process.env): boolean {
  return env.ARIBA_REALM_ALLOWLIST?.trim().toLowerCase() !== "off";
}

/** The page size when a caller names none, and the most one call may ask for. */
export const ARIBA_DEFAULT_LIMIT = 10;
export const ARIBA_MAX_LIMIT = 50;

export type AribaCallRequest =
  | { ok: true; endpointKey: string; realm: string; limit: number }
  | { ok: false; message: string };

/**
 * Validate a call before anything leaves (audit A72, A73, A75). The call route
 * answers every refusal here 400 VALIDATION_ERROR, with no token exchange and
 * no realm call:
 *
 *   - an endpoint key the catalogue does not list. A renamed key used to be a
 *     502 "Ariba call failed" although Ariba was never contacted;
 *   - a malformed ARIBA_REALMS_JSON;
 *   - while realms are configured, a missing realm or one not in the list, so
 *     the deployment's token and apiKey are not spent on a realm it does not
 *     serve. With none configured, the realm is passed through as before, and
 *     ARIBA_REALM_ALLOWLIST=off passes any realm through (the rollback);
 *   - a `limit` that is present but not a positive integer. `limit=` sent
 *     `$top=NaN` and answered an empty success. Absent means 10; above 50 is
 *     capped at 50, as before.
 */
export function parseAribaCallRequest(params: URLSearchParams): AribaCallRequest {
  const endpointKey = params.get("endpoint") ?? "";
  if (!endpointKey) return { ok: false, message: "endpoint is required" };
  if (!getAribaEndpoint(endpointKey)) {
    return { ok: false, message: `Unknown Ariba endpoint: ${endpointKey.slice(0, 80)}` };
  }

  const rawLimit = params.get("limit");
  let limit = ARIBA_DEFAULT_LIMIT;
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1) {
      return { ok: false, message: "limit must be a positive integer" };
    }
    limit = Math.min(Number(rawLimit), ARIBA_MAX_LIMIT);
  }

  let realms: AribaRealm[];
  try {
    realms = getAribaRealms();
  } catch (error) {
    if (!(error instanceof AribaRealmConfigError)) throw error;
    return { ok: false, message: `Ariba realm configuration is invalid. ${error.message}` };
  }
  const realm = params.get("realm") ?? "";
  if (isAribaRealmAllowlistEnforced() && realms.length > 0 && !realms.some((r) => r.key === realm)) {
    return {
      ok: false,
      message: realm ? "realm is not one this deployment configures" : "realm is required",
    };
  }
  return { ok: true, endpointKey, realm, limit };
}

/** A call the connector refuses before sending anything: the caller's error. */
export class AribaRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AribaRequestError";
  }
}

function getTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.ARIBA_TIMEOUT_MS ?? "30000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

/** Our own abort fired: the other side did not answer within ARIBA_TIMEOUT_MS. */
class AribaTimeoutError extends Error {
  constructor(ms: number) {
    super(`Ariba request timed out after ${ms}ms`);
    this.name = "AribaTimeoutError";
  }
}

async function aribaFetch(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AribaTimeoutError(getTimeoutMs());
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

interface OAuthTokenResponse {
  access_token?: unknown;
}

/**
 * What a refused Ariba token request tells the operator to fix: the
 * deployment's variables, not a stored connection (there is none to save).
 */
const aribaTokenRefusalDetail = (status: number): string =>
  isCredentialRefusal(status)
    ? `The Ariba token endpoint refused the deployment's client credentials (HTTP ${status}). ` +
      "Check ARIBA_CLIENT_ID and ARIBA_CLIENT_SECRET."
    : `ARIBA_OAUTH_TOKEN_URL does not point at a token endpoint (HTTP ${status}). Check ARIBA_OAUTH_TOKEN_URL.`;

/**
 * OAuth2 client-credentials → bearer token (Ariba 2-legged OAuth).
 *
 * STATUS FIRST, BODY SECOND (audit A74). The body was parsed before the status
 * was read, so a gateway's HTML 503 surfaced as `Unexpected token '<'` with
 * status 0, and nothing said the token endpoint was down. Every answer without
 * a token is now an OAuthTokenRequestError carrying the endpoint's status: the
 * same error, and so the same TOKEN_* reasons, as the broker's
 * client-credentials exchange. The body never reaches the message, because a
 * token endpoint's error text can echo what was sent.
 */
async function getAribaToken(): Promise<string> {
  const tokenUrl = process.env.ARIBA_OAUTH_TOKEN_URL;
  const clientId = process.env.ARIBA_CLIENT_ID;
  const clientSecret = process.env.ARIBA_CLIENT_SECRET;
  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error("Ariba OAuth is not fully configured (ARIBA_OAUTH_TOKEN_URL/CLIENT_ID/CLIENT_SECRET)");
  }
  const grantType = process.env.ARIBA_OAUTH_GRANT_TYPE ?? "client_credentials";
  const response = await aribaFetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: grantType }),
  });
  const status = response.status;
  const text = await response.text();
  if (!response.ok) {
    throw new OAuthTokenRequestError(
      `Ariba OAuth token request failed: HTTP ${status}`,
      status,
      aribaTokenRefusalDetail(status),
    );
  }
  let json: OAuthTokenResponse | null;
  try {
    json = JSON.parse(text) as OAuthTokenResponse | null;
  } catch {
    json = null;
  }
  const token = json && typeof json === "object" ? json.access_token : undefined;
  if (typeof token !== "string" || !token) {
    throw new OAuthTokenRequestError(
      `Ariba OAuth token endpoint answered HTTP ${status} without an access token`,
      status,
      aribaTokenRefusalDetail(status),
    );
  }
  return token;
}

/**
 * The words a failed token step may show. Only an OAuthTokenRequestError has
 * a sentence built to be shown (publicCredentialFailure); anything else, a
 * timeout or an unreachable host, gets a fixed sentence, because a fetch
 * error's message can name the token URL.
 */
function tokenFailureMessage(error: unknown): string {
  const why =
    publicCredentialFailure(error)?.detail ??
    (error instanceof AribaTimeoutError
      ? `The Ariba token endpoint did not answer in time. ${error.message}.`
      : "The Ariba token endpoint could not be reached.");
  return `The Ariba OAuth token step failed, so no request was sent to the realm. ${why}`;
}

/** The token step's bounded reason: the broker's TOKEN_* vocabulary. */
function tokenFailureReason(error: unknown): string {
  return error instanceof AribaTimeoutError ? "TOKEN_TIMEOUT" : credentialFailure(error).failureReason;
}

/**
 * Pull rows out of an Ariba JSON body. Shapes vary across APIs, so try
 * the common containers before giving up.
 */
function extractAribaRows(json: unknown): {
  rows: Array<Record<string, unknown>>;
  nextPageToken: string | null;
} {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const asRows = (arr: unknown[]): Array<Record<string, unknown>> =>
    arr.filter(isRecord);

  if (Array.isArray(json)) return { rows: asRows(json), nextPageToken: null };

  if (isRecord(json)) {
    const container = ["content", "Records", "records", "items", "results", "value", "data"].find(
      (k) => Array.isArray((json as Record<string, unknown>)[k]),
    );
    const nextPageToken =
      (typeof json.PageToken === "string" && json.PageToken) ||
      (typeof json.nextPageToken === "string" && json.nextPageToken) ||
      null;
    if (container) {
      return { rows: asRows(json[container] as unknown[]), nextPageToken };
    }
    // A single object — present it as one row.
    return { rows: [json], nextPageToken };
  }

  return { rows: [], nextPageToken: null };
}

/** Invoke a catalog endpoint against a realm and preview its JSON rows. */
export async function callAribaEndpoint(
  endpointKey: string,
  realm: string,
  limit: number,
): Promise<AribaCallResult> {
  const endpoint = getAribaEndpoint(endpointKey);
  if (!endpoint) throw new AribaRequestError(`Unknown Ariba endpoint: ${endpointKey.slice(0, 80)}`);
  const base = process.env.ARIBA_BASE_URL;
  const apiKey = process.env.ARIBA_API_KEY;
  if (!base || !apiKey) throw new Error("Ariba is not configured (ARIBA_BASE_URL / ARIBA_API_KEY)");

  // The second guard (A75): the route refuses a bad limit, but nothing this
  // function sends or slices may ever see NaN.
  const whole = Number.isFinite(limit) ? Math.trunc(limit) : ARIBA_DEFAULT_LIMIT;
  const safeLimit = Math.min(Math.max(whole, 1), ARIBA_MAX_LIMIT);
  const url = new URL(`${normalizeBaseUrl(base)}${endpoint.path}`);
  if (realm) url.searchParams.set("realm", realm);
  url.searchParams.set("$top", String(safeLimit));
  url.searchParams.set("limit", String(safeLimit));

  const startedAt = Date.now();
  // The token step has its own catch (A74): its failure is not the realm's.
  let token: string;
  try {
    token = await getAribaToken();
  } catch (error) {
    return {
      endpoint: endpoint.key,
      ok: false,
      status: 0,
      durationMs: Date.now() - startedAt,
      rows: [],
      fields: [],
      nextPageToken: null,
      error: tokenFailureMessage(error),
      stage: "token",
      failureReason: tokenFailureReason(error),
    };
  }

  try {
    const response = await aribaFetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        apiKey,
        Accept: "application/json",
      },
    });
    const durationMs = Date.now() - startedAt;
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("json")) {
      return {
        endpoint: endpoint.key,
        ok: response.ok,
        status: response.status,
        durationMs,
        rows: [],
        fields: [],
        nextPageToken: null,
        error: response.ok ? "Endpoint returned a non-JSON response" : text.slice(0, 300),
        stage: "request",
        failureReason: null,
      };
    }

    // A body labelled JSON that is not keeps the realm's status, as A74 does
    // for the token endpoint, instead of becoming status 0 with a parser error.
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      return {
        endpoint: endpoint.key,
        ok: false,
        status: response.status,
        durationMs,
        rows: [],
        fields: [],
        nextPageToken: null,
        error: `Endpoint answered HTTP ${response.status} with a body that is not valid JSON`,
        stage: "request",
        failureReason: null,
      };
    }
    const extracted = extractAribaRows(json);
    // Fields describe the rows returned, not rows the slice dropped.
    const rows = extracted.rows.slice(0, safeLimit);
    const fields = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 40);
    return {
      endpoint: endpoint.key,
      ok: response.ok,
      status: response.status,
      durationMs,
      rows,
      fields,
      nextPageToken: extracted.nextPageToken,
      error: response.ok ? null : `HTTP ${response.status}`,
      stage: "request",
      failureReason: null,
    };
  } catch (error) {
    return {
      endpoint: endpoint.key,
      ok: false,
      status: 0,
      durationMs: Date.now() - startedAt,
      rows: [],
      fields: [],
      nextPageToken: null,
      error: error instanceof Error ? error.message : "Ariba call failed",
      stage: "request",
      failureReason: null,
    };
  }
}
