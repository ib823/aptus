/**
 * API-reference import normalization — the pure half of
 * scripts/import-sap-api-catalog.ts, extracted so a deployed instance can run
 * the same import through an admin route.
 *
 * WHY THE EXTRACTION. The API tile on Discover projects from SapApiReference,
 * and that table was only ever writable by the local script — so a deployment
 * whose reference predated product tags could never surface private-edition or
 * SuccessFactors APIs, and the only fix was a laptop with the production
 * DATABASE_URL. The Catalogue Health screen's guided refresh now drives this
 * import too, and both callers share ONE normalizer: the script re-exports
 * from here, so the row a laptop writes and the row the route writes are the
 * same row (the edition-tags extraction set this precedent, for the same
 * reason).
 *
 * Everything in this module is pure — no prisma, no fs, no env — so the
 * route, the script and the tests exercise identical behavior.
 */

/** Where the committed catalogue drop lives in the repository. */
export const API_CATALOG_REPO_PATH = "sap-references/api-hub-catalog.json";

// ── Type for normalized rows ────────────────────────────────────────────────
export interface NormalizedApi {
  apiId: string;
  apiName: string;
  description: string;
  status: string;
  category: string | null;
  /** Protocol/type declared by the file (ODATAV2/ODATAV4/REST/SOAP/EVENT), or null. */
  apiType: string | null;
  productTags: string[]; // raw product / category strings for edition mapping
  /**
   * The PRODUCT tag string alone, verbatim, for persistence — category
   * excluded (it has its own column). This is what makes Ariba and
   * SuccessFactors rows addressable: they correctly carry no edition flags,
   * so without a stored product identity no query could reach them.
   */
  productTagsRaw: string | null;
  scopeItemCodes: string[];
  communicationScenarios: string[];
  apiHubUrl: string;
  rawJson: Record<string, unknown>;
}

// ── Tolerant column-name lookup ─────────────────────────────────────────────
// Returns the FIRST matching value for any of the candidate keys, comparing
// case-insensitively and ignoring underscores / spaces / hyphens.
function pickField(row: Record<string, unknown>, ...candidates: string[]): unknown {
  const normalized = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    normalized.set(normalizeKey(k), v);
  }
  for (const c of candidates) {
    const v = normalized.get(normalizeKey(c));
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[\s_\-.]/g, "");
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}
function asArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x : (typeof x === "object" && x !== null ? JSON.stringify(x) : String(x))));
  }
  if (typeof v === "string") {
    // Try to parse as JSON array; otherwise split on common delimiters
    const trimmed = v.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        // fall through
      }
    }
    if (trimmed.length === 0) return [];
    // Split on common delimiters: comma, semicolon, pipe, newline
    return trimmed.split(/[,;|\n]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function normalizeStatus(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("released")) return "Released";
  if (lower.includes("beta")) return "Beta";
  if (lower.includes("deprecat")) return "Deprecated";
  return raw || "Unknown";
}

// The protocol/type the file already declares for the API. We keep the
// canonical SAP tokens the rest of the pipeline filters on (ODATAV2 /
// ODATAV4 / REST / SOAP / EVENT). Returns null when the file says nothing —
// scripts/ingest/refresh-api-types.ts then fills only those NULLs, so a
// value the file provides is never clobbered.
export function normalizeApiType(raw: string): string | null {
  const compact = raw.toLowerCase().replace(/[\s_\-.]/g, "");
  if (!compact) return null;
  if (compact.includes("odatav4") || compact.includes("odata4")) return "ODATAV4";
  if (compact.includes("odatav2") || compact.includes("odata2") || compact === "odata") return "ODATAV2";
  if (compact.includes("soap") || compact.includes("wsdl")) return "SOAP";
  if (compact.includes("rest") || compact.includes("openapi")) return "REST";
  if (compact.includes("event") || compact.includes("amqp") || compact.includes("kafka")) return "EVENT";
  return raw.trim().toUpperCase();
}

// ── JSON parser (handles harvester envelope, array, OData v2, OData v4) ─────
export function parseJson(text: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    // `{ _provenance, apis: [...] }` — what the harvester actually writes.
    if (Array.isArray(o.apis)) return o.apis as Array<Record<string, unknown>>;
    if (Array.isArray(o.value)) return o.value as Array<Record<string, unknown>>;
    if (o.d && typeof o.d === "object") {
      const d = o.d as Record<string, unknown>;
      if (Array.isArray(d.results)) return d.results as Array<Record<string, unknown>>;
    }
  }
  throw new Error(
    "Unrecognized JSON shape — expected an array, { apis: [] } (the harvester's output), { value: [] }, or { d: { results: [] } }",
  );
}

// ── Normalize one parsed row ────────────────────────────────────────────────
export function normalizeRow(row: Record<string, unknown>): NormalizedApi | null {
  const apiIdRaw = pickField(row, "apiId", "Id", "ID", "Name", "API_ID", "API ID", "id");
  if (!apiIdRaw) return null;
  const apiId = asString(apiIdRaw).trim();
  if (!apiId) return null;

  const apiName = asString(pickField(row, "apiName", "title", "Title", "API Name", "name", "label"));
  const description = asString(pickField(row, "description", "Description", "shortText", "summary"));
  const statusRaw = asString(pickField(row, "status", "ReleaseStatus", "Release Status", "state", "lifecycle"));
  const apiType = normalizeApiType(asString(pickField(row, "apiType", "APIType", "type", "protocol", "apiProtocol")));
  const category = asString(pickField(row, "category", "Category", "businessArea", "Business Area"));
  const product1 = asString(pickField(row, "productCategory", "ProductCategory", "Product Category"));
  const product2 = asString(pickField(row, "productLine", "ProductLine", "Product Line"));
  const product3 = asString(pickField(row, "product", "Product"));
  const productTags = [product1, product2, product3, category].filter(Boolean);
  // Persisted verbatim; category stays OUT (it is not a product and has its
  // own column — folding it in here would make "Master Data" look like one).
  const productTagsRaw = [product1, product2, product3].filter(Boolean).join("; ") || null;

  const scopeItemsRaw = pickField(row, "scopeItems", "ScopeItemIds", "Business Scenarios", "businessScenarios", "linkedScopeItems", "scopeItemCodes");
  const scopeItemCodes = asArray(scopeItemsRaw).map((s) => s.toUpperCase()).filter(Boolean);

  const commsRaw = pickField(row, "communicationScenarios", "CommunicationScenarios", "Communication Scenarios", "scenarios");
  const communicationScenarios = asArray(commsRaw);

  const urlRaw = asString(pickField(row, "apiHubUrl", "url", "URL", "link", "Link"));
  const apiHubUrl = urlRaw || `https://api.sap.com/api/${encodeURIComponent(apiId)}`;

  return {
    apiId,
    apiName: apiName || apiId,
    description,
    status: normalizeStatus(statusRaw),
    apiType,
    category: category || null,
    productTags,
    productTagsRaw,
    scopeItemCodes,
    communicationScenarios,
    apiHubUrl,
    rawJson: row,
  };
}
