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
 */

export interface AribaEndpoint {
  key: string;
  label: string;
  group: string;
  path: string;
  description: string;
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
export function isAribaSourcingV1Pinned(env: NodeJS.ProcessEnv = process.env): boolean {
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
 */
const ARIBA_SOURCING_V1_PATHS: Readonly<Record<string, string>> = {
  "sourcing-events": "/api/sourcing-eventmanagement/v1/prod/events",
  "sourcing-projects": "/api/sourcing-projectmanagement/v1/prod/projects",
};

/** The endpoints as this deployment will actually call them. */
export function resolveAribaEndpoints(env: NodeJS.ProcessEnv = process.env): AribaEndpoint[] {
  if (!isAribaSourcingV1Pinned(env)) return ARIBA_ENDPOINTS;
  return ARIBA_ENDPOINTS.map((e) =>
    ARIBA_SOURCING_V1_PATHS[e.key] ? { ...e, path: ARIBA_SOURCING_V1_PATHS[e.key]! } : e,
  );
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

export function getAribaRealms(): AribaRealm[] {
  const json = process.env.ARIBA_REALMS_JSON;
  if (json) {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) throw new Error("ARIBA_REALMS_JSON must be an array");
    return parsed.map((r, i) => {
      const rec = r as Record<string, unknown>;
      const label = typeof rec.label === "string" ? rec.label : `Realm ${i + 1}`;
      const key =
        typeof rec.key === "string" && rec.key.trim()
          ? rec.key.trim()
          : label.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
      return { key, label };
    });
  }
  const single = process.env.ARIBA_REALM;
  if (!single) return [];
  return [{ key: single, label: process.env.ARIBA_REALM_LABEL ?? single }];
}

function getTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.ARIBA_TIMEOUT_MS ?? "30000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function normalizeBaseUrl(raw: string): string {
  return raw.replace(/\/+$/, "");
}

async function aribaFetch(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Ariba request timed out after ${getTimeoutMs()}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

interface OAuthTokenResponse {
  access_token?: unknown;
}

/** OAuth2 client-credentials → bearer token (Ariba 2-legged OAuth). */
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
  const json = (await response.json()) as OAuthTokenResponse;
  if (!response.ok || typeof json.access_token !== "string") {
    throw new Error(`Ariba OAuth token request failed: HTTP ${response.status}`);
  }
  return json.access_token;
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
  if (!endpoint) throw new Error(`Unknown Ariba endpoint: ${endpointKey}`);
  const base = process.env.ARIBA_BASE_URL;
  const apiKey = process.env.ARIBA_API_KEY;
  if (!base || !apiKey) throw new Error("Ariba is not configured (ARIBA_BASE_URL / ARIBA_API_KEY)");

  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const url = new URL(`${normalizeBaseUrl(base)}${endpoint.path}`);
  if (realm) url.searchParams.set("realm", realm);
  url.searchParams.set("$top", String(safeLimit));
  url.searchParams.set("limit", String(safeLimit));

  const startedAt = Date.now();
  try {
    const token = await getAribaToken();
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
      };
    }

    const json = JSON.parse(text) as unknown;
    const { rows, nextPageToken } = extractAribaRows(json);
    const fields = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 40);
    return {
      endpoint: endpoint.key,
      ok: response.ok,
      status: response.status,
      durationMs,
      rows: rows.slice(0, safeLimit),
      fields,
      nextPageToken,
      error: response.ok ? null : `HTTP ${response.status}`,
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
    };
  }
}
