type SapAuthType = "basic" | "bearer" | "oauth-client-credentials";

export interface SapTenant {
  key: string;
  label: string;
  baseUrl: string;
  /**
   * Which SAP environment this tenant is — "DEV" | "TEST" | "PROD", or any name
   * the landscape actually uses. Optional in {PREFIX}_TENANTS_JSON; absent means
   * unknown, and unknown is rendered as no chip rather than a guess.
   */
  environment?: string;
}

export interface SapServiceDefinition {
  key: string;
  label: string;
  scenario: string;
  path: string;
  domain: string;
}

/** A dashboard "operations" card: preview one entity set of one service. */
export interface SapOperationConfig {
  key: string;
  title: string;
  serviceKey: string;
  entitySet: string;
  limit: number;
  fields: string[];
}

/**
 * A connected SAP Cloud OData product (S/4HANA Cloud, SuccessFactors, …).
 * Each product reads its own tenant + credentials from an env prefix
 * (S4_TDD_*, SF_TDD_*) and carries its own OData service catalog and a
 * short list of "operations" the dashboard previews for a health view.
 */
export interface SapOdataProduct {
  key: string;
  label: string;
  /** Env var prefix, e.g. "S4_TDD" → S4_TDD_TENANTS_JSON, S4_TDD_USERNAME… */
  envPrefix: string;
  /** Human blurb for the product switcher. */
  description: string;
  services: SapServiceDefinition[];
  operations: SapOperationConfig[];
}

export interface SapEntitySet {
  name: string;
  entityType: string;
}

/** How the entity-set capability flags were derived. */
export type MetadataFlavor = "v2" | "v4-best-effort";

/**
 * Per-entity-set C/R/U/D capability, parsed from $metadata.
 *   V2  → reliable: sap:creatable/updatable/deletable/pageable/addressable.
 *   V4  → best-effort from Capabilities annotations; unconfirmed flags are null
 *         (never inferred as writable), and the result is flagged v4-best-effort.
 */
export interface EntityCapability {
  name: string;
  readable: boolean;
  creatable: boolean | null;
  updatable: boolean | null;
  deletable: boolean | null;
  pageable: boolean | null;
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

// ─── S/4HANA Cloud Public Edition — procurement OData catalog ──────────
const S4HANA_SERVICES: SapServiceDefinition[] = [
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

const S4HANA_OPERATIONS: SapOperationConfig[] = [
  {
    key: "purchaseOrders",
    title: "Purchase Orders",
    serviceKey: "purchase-orders",
    entitySet: "A_PurchaseOrder",
    limit: 25,
    fields: [
      "PurchaseOrder",
      "PurchaseOrderType",
      "Supplier",
      "CompanyCode",
      "PurchasingOrganization",
      "PurchasingGroup",
      "PurchaseOrderDate",
      "DocumentCurrency",
    ],
  },
  {
    key: "supplierInvoices",
    title: "Supplier Invoices",
    serviceKey: "supplier-invoices",
    entitySet: "A_SupplierInvoice",
    limit: 25,
    fields: [
      "SupplierInvoice",
      "FiscalYear",
      "CompanyCode",
      "Supplier",
      "DocumentDate",
      "PostingDate",
      "DocumentCurrency",
      "InvoiceGrossAmount",
    ],
  },
  {
    key: "purchaseContracts",
    title: "Purchase Contracts",
    serviceKey: "purchase-contracts",
    entitySet: "A_PurchaseContract",
    limit: 25,
    fields: [
      "PurchaseContract",
      "PurchaseContractType",
      "Supplier",
      "CompanyCode",
      "PurchasingOrganization",
      "ValidityStartDate",
      "ValidityEndDate",
      "DocumentCurrency",
    ],
  },
  {
    key: "commercialProjects",
    title: "Commercial Projects",
    serviceKey: "commercial-projects",
    entitySet: "ProjectSet",
    limit: 25,
    fields: [
      "ProjectUUID",
      "ProjectID",
      "ProjectName",
      "Customer",
      "CompanyCode",
      "ServiceOrganization",
      "StartDate",
      "EndDate",
    ],
  },
];

// ─── SuccessFactors — Employee Central + Recruiting/Onboarding OData ────
// SuccessFactors exposes a single OData V2 service root (/odata/v2) with
// many entity sets. We model logical "services" as that same root so the
// entity explorer and preview reuse the S/4 OData path unchanged; the
// distinct catalogs just document which families live under it.
const SF_ODATA_ROOT = "/odata/v2";

const SUCCESSFACTORS_SERVICES: SapServiceDefinition[] = [
  {
    key: "employee-central",
    label: "Employee Central",
    scenario: "SF_EC",
    path: SF_ODATA_ROOT,
    domain: "Core HR",
  },
  {
    key: "recruiting",
    label: "Recruiting",
    scenario: "SF_RCM",
    path: SF_ODATA_ROOT,
    domain: "Recruiting",
  },
  {
    key: "onboarding",
    label: "Onboarding",
    scenario: "SF_ONB2",
    path: SF_ODATA_ROOT,
    domain: "Onboarding",
  },
];

// Dashboard quick-view entities. Entity-set names are confirmed against
// the SAP SuccessFactors HCM Suite OData API Reference Guide: User
// (§5.15), JobRequisition (§16.2.1), JobApplication (§16.1.1), Candidate
// (§16.3), ONB2Process (§14.3.1). EmpEmployment is the standard Employee
// Central entity. The entity explorer auto-discovers the tenant's full
// entity set from $metadata (Ch. 4), so these cards are a curated view,
// not the limit of coverage.
const SUCCESSFACTORS_OPERATIONS: SapOperationConfig[] = [
  {
    key: "users",
    title: "Users",
    serviceKey: "employee-central",
    entitySet: "User",
    limit: 25,
    fields: ["userId", "username", "firstName", "lastName", "email", "department", "division", "jobTitle"],
  },
  {
    key: "employment",
    title: "Employment",
    serviceKey: "employee-central",
    entitySet: "EmpEmployment",
    limit: 25,
    fields: ["personIdExternal", "userId", "startDate", "endDate", "isContingentWorker"],
  },
  {
    key: "jobRequisitions",
    title: "Job Requisitions",
    serviceKey: "recruiting",
    entitySet: "JobRequisition",
    limit: 25,
    fields: ["jobReqId", "jobTitle", "status", "department", "division", "location"],
  },
  {
    key: "candidates",
    title: "Candidates",
    serviceKey: "recruiting",
    entitySet: "Candidate",
    limit: 25,
    fields: ["candidateId", "firstName", "lastName", "primaryEmail", "currentTitle", "creationDateTime"],
  },
  {
    key: "onboardingProcesses",
    title: "Onboarding",
    serviceKey: "onboarding",
    entitySet: "ONB2Process",
    limit: 25,
    fields: ["processId", "processStatus", "startDate", "candidateId"],
  },
];

/** Registry of connected OData products, keyed by product key. */
export const SAP_ODATA_PRODUCTS: SapOdataProduct[] = [
  {
    key: "s4hana",
    label: "S/4HANA Cloud",
    envPrefix: "S4_TDD",
    description: "S/4HANA Cloud Public Edition — procurement & finance OData APIs.",
    services: S4HANA_SERVICES,
    operations: S4HANA_OPERATIONS,
  },
  {
    key: "successfactors",
    label: "SuccessFactors",
    envPrefix: "SF_TDD",
    description: "SuccessFactors — Employee Central, Recruiting & Onboarding OData APIs.",
    services: SUCCESSFACTORS_SERVICES,
    operations: SUCCESSFACTORS_OPERATIONS,
  },
];

export const DEFAULT_PRODUCT_KEY = "s4hana";

/**
 * Ariba is a REST product (see products.ts / ariba-connector), not OData — but it
 * IS a known product. Return a placeholder with no OData tenants so an OData route
 * hit with product=ariba reports "No SAP tenant is configured" (same path as an
 * unconfigured SuccessFactors) instead of a misleading "Unknown product". Not part
 * of SAP_ODATA_PRODUCTS, so listProductSummaries never double-counts it.
 */
const ARIBA_ODATA_PLACEHOLDER: SapOdataProduct = {
  key: "ariba",
  label: "Ariba",
  envPrefix: "ARIBA_TDD",
  description: "SAP Ariba (REST) — not exposed via the OData routes.",
  services: [],
  operations: [],
};

export function getSapProduct(key: string | null | undefined): SapOdataProduct | null {
  const wanted = key && key.trim() ? key.trim() : DEFAULT_PRODUCT_KEY;
  const found = SAP_ODATA_PRODUCTS.find((p) => p.key === wanted);
  if (found) return found;
  if (wanted === "ariba") return ARIBA_ODATA_PLACEHOLDER; // known, but unconfigured for OData
  return null;
}

/** @deprecated Use getSapProduct(key).services. Kept for existing imports. */
export const SAP_TDD_SERVICES = S4HANA_SERVICES;

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

function env(prefix: string, name: string): string | undefined {
  return process.env[`${prefix}_${name}`];
}

function getRequestTimeoutMs(prefix: string): number {
  const parsed = Number.parseInt(env(prefix, "TIMEOUT_MS") ?? "30000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function getProbeConcurrency(prefix: string): number {
  const parsed = Number.parseInt(env(prefix, "PROBE_CONCURRENCY") ?? "4", 10);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(Math.max(parsed, 1), 8);
}

export function isSapTddPublicAccessEnabled(prefix: string = "S4_TDD"): boolean {
  const raw = env(prefix, "PUBLIC_ACCESS");
  if (raw === "true") return true;
  if (raw === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function isSapTddWriteEnabled(prefix: string = "S4_TDD"): boolean {
  return env(prefix, "WRITE_ENABLED") === "true";
}

export function getSapTddWriteSecretRequired(prefix: string = "S4_TDD"): boolean {
  return Boolean(env(prefix, "WRITE_SECRET"));
}

/** The configured write secret for a product, if any. */
export function getSapTddWriteSecret(prefix: string = "S4_TDD"): string | undefined {
  return env(prefix, "WRITE_SECRET");
}

async function sapFetch(input: string, init: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
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

/**
 * Tenants configured for a product. `prefix` defaults to S4_TDD so the
 * no-arg call keeps working for the S/4 workbench-home gate.
 */
export function getConfiguredSapTenants(prefix: string = "S4_TDD"): SapTenant[] {
  const tenantsJson = env(prefix, "TENANTS_JSON");
  if (tenantsJson) {
    const parsed = JSON.parse(tenantsJson) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`${prefix}_TENANTS_JSON must be an array`);
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
      // Optional: a landscape that has not declared environments keeps working,
      // and its tenants simply carry no environment claim.
      const environment =
        typeof record.environment === "string" && record.environment.trim()
          ? record.environment.trim().toUpperCase()
          : undefined;
      return {
        key,
        label,
        baseUrl: normalizeBaseUrl(baseUrl),
        ...(environment ? { environment } : {}),
      };
    });
  }

  const baseUrl = env(prefix, "BASE_URL");
  if (!baseUrl) return [];
  const singleEnv = env(prefix, "TENANT_ENVIRONMENT");
  return [
    {
      key: "default",
      label: env(prefix, "TENANT_LABEL") ?? "Configured Tenant",
      baseUrl: normalizeBaseUrl(baseUrl),
      ...(singleEnv ? { environment: singleEnv.trim().toUpperCase() } : {}),
    },
  ];
}

export function getSapTenant(prefix: string, key: string): SapTenant | null {
  return getConfiguredSapTenants(prefix).find((tenant) => tenant.key === key) ?? null;
}

export function getSapService(product: SapOdataProduct, key: string): SapServiceDefinition | null {
  return product.services.find((service) => service.key === key) ?? null;
}

function getAuthType(prefix: string): SapAuthType {
  const raw = env(prefix, "AUTH_TYPE") ?? "basic";
  if (raw === "basic" || raw === "bearer" || raw === "oauth-client-credentials") {
    return raw;
  }
  throw new Error(`${prefix}_AUTH_TYPE must be basic, bearer, or oauth-client-credentials`);
}

function requiredEnv(prefix: string, name: string): string {
  const value = env(prefix, name);
  if (!value) throw new Error(`Missing required env var: ${prefix}_${name}`);
  return value;
}

async function fetchOAuthToken(prefix: string): Promise<string> {
  const tokenUrl = requiredEnv(prefix, "OAUTH_TOKEN_URL");
  const clientId = requiredEnv(prefix, "CLIENT_ID");
  const clientSecret = requiredEnv(prefix, "CLIENT_SECRET");
  const response = await sapFetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  }, getRequestTimeoutMs(prefix));
  const json = (await response.json()) as OAuthTokenResponse;
  if (!response.ok || typeof json.access_token !== "string") {
    throw new Error(`OAuth token request failed: HTTP ${response.status}`);
  }
  return json.access_token;
}

async function buildAuthHeader(prefix: string): Promise<string> {
  const authType = getAuthType(prefix);
  if (authType === "basic") {
    const username = requiredEnv(prefix, "USERNAME");
    const password = requiredEnv(prefix, "PASSWORD");
    return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }
  if (authType === "bearer") {
    return `Bearer ${requiredEnv(prefix, "BEARER_TOKEN")}`;
  }
  return `Bearer ${await fetchOAuthToken(prefix)}`;
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

/**
 * Decide how to read capabilities. SAP TDD OData services are predominantly V2
 * (sap:* attributes on EntitySet). V4 exposes capabilities via
 * Org.OData.Capabilities annotations instead — best-effort only.
 */
export function detectMetadataFlavor(metadataXml: string): MetadataFlavor {
  if (/\bsap:(creatable|updatable|deletable|pageable|addressable)=/.test(metadataXml)) return "v2";
  if (/Version="4\.0"/.test(metadataXml) || /Org\.OData\.Capabilities/.test(metadataXml)) return "v4-best-effort";
  return "v2";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** V4 best-effort: read a boolean restriction (Insertable/Updatable/Deletable). */
function readV4Restriction(xml: string, entitySet: string, term: string, property: string): boolean | null {
  // Find the <Annotations Target="...Container/EntitySet"> block for this set.
  const block = xml.match(
    new RegExp(`<Annotations\\b[^>]*Target="[^"]*[/.]${escapeRegExp(entitySet)}"[^>]*>([\\s\\S]*?)</Annotations>`),
  )?.[1];
  if (!block) return null;
  const termBlock = block.match(
    new RegExp(`Capabilities\\.V1\\.${term}[\\s\\S]*?Property="${property}"\\s+Bool="(true|false)"`),
  )?.[1];
  if (termBlock === undefined) return null;
  return termBlock === "true";
}

/**
 * Parse per-entity-set C/R/U/D from $metadata. V2 is reliable; V4 is best-effort
 * (unconfirmed flags stay null — never inferred writable). Read the flavor with
 * detectMetadataFlavor to know which applies.
 */
export function parseEntityCapabilities(metadataXml: string): EntityCapability[] {
  const flavor = detectMetadataFlavor(metadataXml);
  const caps: EntityCapability[] = [];
  const re = /<EntitySet\b([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(metadataXml)) !== null) {
    const attrs = match[1] ?? "";
    const name = attrs.match(/\bName="([^"]+)"/)?.[1];
    if (!name) continue;
    if (flavor === "v2") {
      // SAP V2: attribute omitted ⇒ true; only an explicit ="false" disables.
      const flag = (attr: string): boolean => attrs.match(new RegExp(`\\bsap:${attr}="([^"]+)"`))?.[1] !== "false";
      caps.push({
        name,
        readable: flag("addressable"),
        creatable: flag("creatable"),
        updatable: flag("updatable"),
        deletable: flag("deletable"),
        pageable: flag("pageable"),
      });
    } else {
      // V4 best-effort: only what the Capabilities annotations explicitly state.
      caps.push({
        name,
        readable: true, // present in $metadata ⇒ readable
        creatable: readV4Restriction(metadataXml, name, "InsertRestrictions", "Insertable"),
        updatable: readV4Restriction(metadataXml, name, "UpdateRestrictions", "Updatable"),
        deletable: readV4Restriction(metadataXml, name, "DeleteRestrictions", "Deletable"),
        pageable: null,
      });
    }
  }
  return caps;
}

/**
 * Single source of truth for the read/write summary derived from $metadata
 * capabilities. Used identically by the chips, the list route, and the detail
 * route so a row's collapsed chip can never contradict its expanded detail.
 *   read  = any entity set is readable
 *   write = any entity set is EXPLICITLY creatable OR updatable OR deletable
 *           (create-only / update-only / delete-only all count; V4 best-effort
 *           nulls never read as writable)
 */
export function deriveReadWrite(entities: EntityCapability[]): { read: boolean; write: boolean } {
  const read = entities.some((e) => e.readable);
  const write = entities.some((e) => e.creatable === true || e.updatable === true || e.deletable === true);
  return { read, write };
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
  prefix: string,
  tenant: SapTenant,
  service: SapServiceDefinition,
): Promise<{ entitySets: SapEntitySet[] }> {
  const response = await sapFetch(`${serviceUrl(tenant, service)}/$metadata`, {
    headers: {
      Authorization: await buildAuthHeader(prefix),
      Accept: "application/xml, text/xml, */*",
    },
  }, getRequestTimeoutMs(prefix));
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Metadata request failed: HTTP ${response.status}`);
  }
  return { entitySets: parseEntitySets(text) };
}

/**
 * Like inspectSapService but also returns per-entity-set C/R/U/D capabilities
 * and the metadata flavor, from the same single $metadata fetch (read-only).
 */
export async function inspectSapServiceMetadata(
  prefix: string,
  tenant: SapTenant,
  service: SapServiceDefinition,
): Promise<{ entitySets: SapEntitySet[]; entityCapabilities: EntityCapability[]; flavor: MetadataFlavor }> {
  const response = await sapFetch(`${serviceUrl(tenant, service)}/$metadata`, {
    headers: {
      Authorization: await buildAuthHeader(prefix),
      Accept: "application/xml, text/xml, */*",
    },
  }, getRequestTimeoutMs(prefix));
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Metadata request failed: HTTP ${response.status}`);
  }
  return {
    entitySets: parseEntitySets(text),
    entityCapabilities: parseEntityCapabilities(text),
    flavor: detectMetadataFlavor(text),
  };
}

export async function probeSapEntitySet(
  prefix: string,
  tenant: SapTenant,
  service: SapServiceDefinition,
  entitySetName: string,
): Promise<SapEntityProbe> {
  const startedAt = Date.now();
  const response = await sapFetch(
    `${serviceUrl(tenant, service)}/${encodeURIComponent(entitySetName)}?$top=1&$format=json`,
    {
      headers: {
        Authorization: await buildAuthHeader(prefix),
        Accept: "application/json",
      },
    },
    getRequestTimeoutMs(prefix),
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
  prefix: string,
  tenant: SapTenant,
  service: SapServiceDefinition,
  entitySetNames: string[],
): Promise<SapEntityProbe[]> {
  return mapWithConcurrency(entitySetNames, getProbeConcurrency(prefix), (entitySetName) =>
    probeSapEntitySet(prefix, tenant, service, entitySetName),
  );
}

export async function previewSapEntitySet(
  prefix: string,
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
        Authorization: await buildAuthHeader(prefix),
        Accept: "application/json",
      },
    },
    getRequestTimeoutMs(prefix),
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
  prefix: string,
  tenant: SapTenant,
  service: SapServiceDefinition,
): Promise<{ token: string; cookie: string }> {
  const response = await sapFetch(`${serviceUrl(tenant, service)}/`, {
    headers: {
      Authorization: await buildAuthHeader(prefix),
      Accept: "application/json",
      "X-CSRF-Token": "Fetch",
    },
  }, getRequestTimeoutMs(prefix));
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
  prefix: string,
  tenant: SapTenant,
  service: SapServiceDefinition,
  entitySetName: string,
  payload: Record<string, unknown>,
): Promise<SapWriteResult> {
  const { token, cookie } = await fetchCsrfSession(prefix, tenant, service);
  const startedAt = Date.now();
  const headers: HeadersInit = {
    Authorization: await buildAuthHeader(prefix),
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-CSRF-Token": token,
  };
  if (cookie) headers.Cookie = cookie;

  const response = await sapFetch(`${serviceUrl(tenant, service)}/${encodeURIComponent(entitySetName)}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  }, getRequestTimeoutMs(prefix));
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

/**
 * Delete a record by the Location URL a create returned (relative or absolute).
 * Used only by the guarded capability write-test's create-then-delete. Fetches
 * a fresh CSRF token from the service root, then issues the DELETE.
 */
export async function deleteSapEntityByLocation(
  prefix: string,
  tenant: SapTenant,
  service: SapServiceDefinition,
  location: string,
): Promise<{ ok: boolean; status: number }> {
  const { token, cookie } = await fetchCsrfSession(prefix, tenant, service);
  const url = location.startsWith("http")
    ? location
    : `${tenant.baseUrl}${location.startsWith("/") ? "" : "/"}${location}`;
  const headers: HeadersInit = {
    Authorization: await buildAuthHeader(prefix),
    Accept: "application/json",
    "X-CSRF-Token": token,
  };
  if (cookie) headers.Cookie = cookie;
  const response = await sapFetch(url, { method: "DELETE", headers }, getRequestTimeoutMs(prefix));
  return { ok: response.ok, status: response.status };
}
