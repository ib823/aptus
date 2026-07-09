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

// Starter catalog — Sourcing + Supplier and Reporting families.
export const ARIBA_ENDPOINTS: AribaEndpoint[] = [
  {
    key: "sourcing-events",
    label: "Sourcing Events",
    group: "Sourcing + Supplier",
    path: "/api/sourcing-eventmanagement/v1/prod/events",
    description: "RFx / sourcing events managed in Ariba Sourcing.",
  },
  {
    key: "sourcing-projects",
    label: "Sourcing Projects",
    group: "Sourcing + Supplier",
    path: "/api/sourcing-projectmanagement/v1/prod/projects",
    description: "Sourcing project workspaces and their status.",
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
  {
    key: "operational-views",
    label: "Operational Reporting — Views",
    group: "Reporting",
    path: "/api/operational-reporting-view/v1/prod/views",
    description: "Available operational report view templates.",
  },
];

export const ARIBA_PRODUCT = {
  key: "ariba",
  label: "SAP Ariba",
  description: "SAP Ariba — Sourcing, Supplier & Reporting REST APIs.",
} as const;

export function getAribaEndpoint(key: string): AribaEndpoint | null {
  return ARIBA_ENDPOINTS.find((e) => e.key === key) ?? null;
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
