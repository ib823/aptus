type SapAuthType = "basic" | "bearer" | "oauth-client-credentials";

export interface SapTenant {
  key: string;
  label: string;
  baseUrl: string;
}

export interface SapServiceDefinition {
  key: string;
  label: string;
  scenario: string;
  path: string;
  domain: string;
}

export interface SapEntitySet {
  name: string;
  entityType: string;
}

export interface SapEntityProbe {
  name: string;
  ok: boolean;
  status: number;
  durationMs: number;
  resultCount?: number;
  firstResultKeys?: string[];
  hasErrorBody?: boolean;
}

export interface SapPreviewResult {
  entitySet: string;
  ok: boolean;
  status: number;
  durationMs: number;
  rows: Array<Record<string, unknown>>;
  nextLink: string | null;
  fields: string[];
}

export interface SapWriteResult {
  entitySet: string;
  ok: boolean;
  status: number;
  durationMs: number;
  location: string | null;
  body: unknown;
}

export const SAP_TDD_SERVICES: SapServiceDefinition[] = [
  {
    key: "purchase-orders",
    label: "Purchase Orders",
    scenario: "SAP_COM_0053",
    path: "/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV",
    domain: "Sourcing and Procurement",
  },
  {
    key: "supplier-invoices",
    label: "Supplier Invoices",
    scenario: "SAP_COM_0057",
    path: "/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV",
    domain: "Accounts Payable",
  },
  {
    key: "purchase-contracts",
    label: "Purchase Contracts",
    scenario: "SAP_COM_0101",
    path: "/sap/opu/odata/sap/API_PURCHASECONTRACT_PROCESS_SRV",
    domain: "Sourcing and Procurement",
  },
  {
    key: "commercial-projects",
    label: "Commercial Projects",
    scenario: "SAP_COM_0054",
    path: "/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV",
    domain: "Professional Services",
  },
  {
    key: "attachments",
    label: "Attachments",
    scenario: "SAP_COM_0053 / 0054 / 0057",
    path: "/sap/opu/odata/sap/API_CV_ATTACHMENT_SRV",
    domain: "Document Management",
  },
];

interface OAuthTokenResponse {
  access_token?: unknown;
}

interface ODataV2Response {
  d?: {
    results?: unknown[];
    __next?: string;
  };
  error?: unknown;
}

interface ODataV4Response {
  value?: unknown[];
  "@odata.nextLink"?: string;
  error?: unknown;
}

function getRequestTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.S4_TDD_TIMEOUT_MS ?? "30000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function getProbeConcurrency(): number {
  const parsed = Number.parseInt(process.env.S4_TDD_PROBE_CONCURRENCY ?? "4", 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(Math.max(parsed, 1), 8);
}

export function isSapTddPublicAccessEnabled(): boolean {
  const raw = process.env.S4_TDD_PUBLIC_ACCESS;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function isSapTddWriteEnabled(): boolean {
  return process.env.S4_TDD_WRITE_ENABLED === "true";
}

export function getSapTddWriteSecretRequired(): boolean {
  return Boolean(process.env.S4_TDD_WRITE_SECRET);
}

async function sapFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const timeoutMs = getRequestTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`SAP request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index] as T);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function normalizeBaseUrl(raw: string): string {
  const url = new URL(raw);
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function sanitizeTenantKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getConfiguredSapTenants(): SapTenant[] {
  const tenantsJson = process.env.S4_TDD_TENANTS_JSON;
  if (tenantsJson) {
    const parsed = JSON.parse(tenantsJson) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("S4_TDD_TENANTS_JSON must be an array");
    }
    return parsed.map((tenant, index) => {
      const record = tenant as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label : `Tenant ${index + 1}`;
      const key =
        typeof record.key === "string" && record.key.trim()
          ? sanitizeTenantKey(record.key)
          : sanitizeTenantKey(label);
      const baseUrl = typeof record.baseUrl === "string" ? record.baseUrl : "";
      if (!baseUrl) {
        throw new Error(`Tenant ${label} is missing baseUrl`);
      }
      return { key, label, baseUrl: normalizeBaseUrl(baseUrl) };
    });
  }

  const baseUrl = process.env.S4_TDD_BASE_URL;
  if (!baseUrl) return [];
  return [
    {
      key: "default",
      label: process.env.S4_TDD_TENANT_LABEL ?? "Configured Tenant",
      baseUrl: normalizeBaseUrl(baseUrl),
    },
  ];
}

export function getSapTenant(key: string): SapTenant | null {
  return getConfiguredSapTenants().find((tenant) => tenant.key === key) ?? null;
}

export function getSapService(key: string): SapServiceDefinition | null {
  return SAP_TDD_SERVICES.find((service) => service.key === key) ?? null;
}

function getAuthType(): SapAuthType {
  const raw = process.env.S4_TDD_AUTH_TYPE ?? "basic";
  if (raw === "basic" || raw === "bearer" || raw === "oauth-client-credentials") {
    return raw;
  }
  throw new Error("S4_TDD_AUTH_TYPE must be basic, bearer, or oauth-client-credentials");
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function fetchOAuthToken(): Promise<string> {
  const tokenUrl = requiredEnv("S4_TDD_OAUTH_TOKEN_URL");
  const clientId = requiredEnv("S4_TDD_CLIENT_ID");
  const clientSecret = requiredEnv("S4_TDD_CLIENT_SECRET");
  const response = await sapFetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  const json = (await response.json()) as OAuthTokenResponse;
  if (!response.ok || typeof json.access_token !== "string") {
    throw new Error(`OAuth token request failed: HTTP ${response.status}`);
  }
  return json.access_token;
}

async function buildAuthHeader(): Promise<string> {
  const authType = getAuthType();
  if (authType === "basic") {
    const username = requiredEnv("S4_TDD_USERNAME");
    const password = requiredEnv("S4_TDD_PASSWORD");
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }
  if (authType === "bearer") {
    return `Bearer ${requiredEnv("S4_TDD_BEARER_TOKEN")}`;
  }
  return `Bearer ${await fetchOAuthToken()}`;
}

function serviceUrl(tenant: SapTenant, service: SapServiceDefinition): string {
  return `${tenant.baseUrl}${service.path}`;
}

function extractCookies(headers: Headers): string {
  const extendedHeaders = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = extendedHeaders.getSetCookie?.() ?? [];
  const rawCookies = setCookies.length > 0 ? setCookies : [headers.get("set-cookie")].filter(Boolean);
  return rawCookies
    .map((cookie) => cookie?.split(";")[0] ?? "")
    .filter(Boolean)
    .join("; ");
}

function parseEntitySets(metadataXml: string): SapEntitySet[] {
  const entitySets: SapEntitySet[] = [];
  const re = /<EntitySet\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(metadataXml)) !== null) {
    const attrs = match[1] ?? "";
    const name = attrs.match(/\bName="([^"]+)"/)?.[1];
    const entityType = attrs.match(/\bEntityType="([^"]+)"/)?.[1];
    if (name && entityType) entitySets.push({ name, entityType });
  }
  return entitySets;
}

function toRecordRows(rows: unknown[]): Array<Record<string, unknown>> {
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => {
      const { __metadata: _metadata, ...rest } = row;
      return rest;
    });
}

function extractRows(json: ODataV2Response | ODataV4Response): {
  rows: Array<Record<string, unknown>>;
  nextLink: string | null;
} {
  if ("d" in json && Array.isArray(json.d?.results)) {
    return {
      rows: toRecordRows(json.d.results),
      nextLink: typeof json.d.__next === "string" ? json.d.__next : null,
    };
  }
  if ("value" in json && Array.isArray(json.value)) {
    return {
      rows: toRecordRows(json.value),
      nextLink: typeof json["@odata.nextLink"] === "string" ? json["@odata.nextLink"] : null,
    };
  }
  return { rows: [], nextLink: null };
}

export async function inspectSapService(
  tenant: SapTenant,
  service: SapServiceDefinition,
): Promise<{ entitySets: SapEntitySet[] }> {
  const response = await sapFetch(`${serviceUrl(tenant, service)}/$metadata`, {
    headers: {
      Authorization: await buildAuthHeader(),
      Accept: "application/xml, text/xml, */*",
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Metadata request failed: HTTP ${response.status}`);
  }
  return { entitySets: parseEntitySets(text) };
}

export async function probeSapEntitySet(
  tenant: SapTenant,
  service: SapServiceDefinition,
  entitySetName: string,
): Promise<SapEntityProbe> {
  const startedAt = Date.now();
  const response = await sapFetch(
    `${serviceUrl(tenant, service)}/${encodeURIComponent(entitySetName)}?$top=1&$format=json`,
    {
      headers: {
        Authorization: await buildAuthHeader(),
        Accept: "application/json",
      },
    },
  );
  const durationMs = Date.now() - startedAt;
  const text = await response.text();
  const probe: SapEntityProbe = {
    name: entitySetName,
    ok: response.ok,
    status: response.status,
    durationMs,
  };
  if (!text || !response.headers.get("content-type")?.includes("application/json")) {
    return probe;
  }

  const json = JSON.parse(text) as ODataV2Response | ODataV4Response;
  if (json.error) probe.hasErrorBody = true;
  const { rows } = extractRows(json);
  probe.resultCount = rows.length;
  probe.firstResultKeys = rows[0] ? Object.keys(rows[0]).slice(0, 12) : [];
  return probe;
}

export async function probeSapEntitySets(
  tenant: SapTenant,
  service: SapServiceDefinition,
  entitySetNames: string[],
): Promise<SapEntityProbe[]> {
  return mapWithConcurrency(entitySetNames, getProbeConcurrency(), (entitySetName) =>
    probeSapEntitySet(tenant, service, entitySetName),
  );
}

export async function previewSapEntitySet(
  tenant: SapTenant,
  service: SapServiceDefinition,
  entitySetName: string,
  limit: number,
): Promise<SapPreviewResult> {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const startedAt = Date.now();
  const response = await sapFetch(
    `${serviceUrl(tenant, service)}/${encodeURIComponent(entitySetName)}?$top=${safeLimit}&$format=json`,
    {
      headers: {
        Authorization: await buildAuthHeader(),
        Accept: "application/json",
      },
    },
  );
  const durationMs = Date.now() - startedAt;
  const text = await response.text();
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`Preview returned non-JSON response: HTTP ${response.status}`);
  }

  const json = JSON.parse(text) as ODataV2Response | ODataV4Response;
  const { rows, nextLink } = extractRows(json);
  const fields = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 40);
  return {
    entitySet: entitySetName,
    ok: response.ok,
    status: response.status,
    durationMs,
    rows,
    nextLink,
    fields,
  };
}

async function fetchCsrfSession(
  tenant: SapTenant,
  service: SapServiceDefinition,
): Promise<{ token: string; cookie: string }> {
  const response = await sapFetch(`${serviceUrl(tenant, service)}/`, {
    headers: {
      Authorization: await buildAuthHeader(),
      Accept: "application/json",
      "X-CSRF-Token": "Fetch",
    },
  });
  const token = response.headers.get("x-csrf-token");
  if (!response.ok || !token) {
    throw new Error(`CSRF token request failed: HTTP ${response.status}`);
  }
  return { token, cookie: extractCookies(response.headers) };
}

function parseSapWriteBody(text: string, contentType: string | null): unknown {
  if (!text) return null;
  if (contentType?.includes("application/json")) {
    return JSON.parse(text) as unknown;
  }
  return text.slice(0, 4000);
}

export async function createSapEntitySetRecord(
  tenant: SapTenant,
  service: SapServiceDefinition,
  entitySetName: string,
  payload: Record<string, unknown>,
): Promise<SapWriteResult> {
  const { token, cookie } = await fetchCsrfSession(tenant, service);
  const startedAt = Date.now();
  const headers: HeadersInit = {
    Authorization: await buildAuthHeader(),
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-CSRF-Token": token,
  };
  if (cookie) headers.Cookie = cookie;

  const response = await sapFetch(`${serviceUrl(tenant, service)}/${encodeURIComponent(entitySetName)}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const durationMs = Date.now() - startedAt;
  const text = await response.text();
  return {
    entitySet: entitySetName,
    ok: response.ok,
    status: response.status,
    durationMs,
    location: response.headers.get("location"),
    body: parseSapWriteBody(text, response.headers.get("content-type")),
  };
}
