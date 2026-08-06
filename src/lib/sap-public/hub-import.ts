/**
 * SAP Capability Catalogue — shared, side-effect-free import normalizer.
 *
 * Pure functions (no fs, no Prisma) so BOTH the local script
 * (scripts/import-sap-hub-content.ts) and the admin Rebuild endpoint
 * (/api/sap/tdd/hub-content/seed) normalize dropped Hub exports identically.
 *
 * Two entry points:
 *   normalizeHubRow(row)                 — contentType taken from the row itself
 *   normalizeHubRowForType(row, type)    — contentType stamped from the filename
 *                                          (sap-references/hub-content/<TYPE>.json)
 *
 * NEVER fabricates: a row without a usable externalId returns null and is skipped.
 */
import { isHubContentType, type HubContentType } from "@/lib/sap-public/hub-content";
import { mapEditionFromProductTags } from "@/lib/sap-public/edition-tags";

export interface NormalizedHubContent {
  contentType: HubContentType;
  externalId: string;
  title: string;
  description: string;
  packageId: string | null;
  appliesToPublic: boolean;
  appliesToPrivate: boolean;
  appliesToOnPrem: boolean;
  /** SAP's verbatim product tag string (SapApiReference convention), or null. */
  productTags: string | null;
  status: string;
  apiType: string | null;
  communicationScenarios: string[];
  scopeItemCodes: string[];
  itemCount: number | null;
  /**
   * TRUE = the source file declares this row a repo-authored placeholder
   * (the seed file marks all 36 of its rows). Absent in a real SAP export →
   * false. This flag was DROPPED here for months, which made illustrative
   * seed rows indistinguishable from harvested catalogue content.
   */
  illustrative: boolean;
  hubUrl: string;
  rawJson: Record<string, unknown>;
}

// ── tolerant field access ────────────────────────────────────────────────────
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[\s_\-.]/g, "");
}
function pickField(row: Record<string, unknown>, ...candidates: string[]): unknown {
  const map = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) map.set(normalizeKey(k), v);
  for (const c of candidates) {
    const v = map.get(normalizeKey(c));
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}
function asString(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}
function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    const t = v.trim();
    if (t.startsWith("[")) {
      try {
        const p = JSON.parse(t);
        if (Array.isArray(p)) return p.map(String);
      } catch {
        /* fall through */
      }
    }
    return t.split(/[,;|\n]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}
function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return fallback;
}
function asIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Normalize an apiType token, or null. */
export function normalizeHubApiType(raw: string): string | null {
  const c = raw.toLowerCase().replace(/[\s_\-.]/g, "");
  if (!c) return null;
  if (c.includes("odatav4") || c.includes("odata4")) return "ODATAV4";
  if (c.includes("odatav2") || c.includes("odata2") || c === "odata") return "ODATAV2";
  if (c.includes("soap") || c.includes("wsdl")) return "SOAP";
  if (c.includes("cds")) return "CDS";
  if (c.includes("rest") || c.includes("openapi")) return "REST";
  return raw.trim().toUpperCase();
}

/** Parse a JSON file body into an array of rows (array / OData v2 / v4 shapes). */
export function parseHubJson(text: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.value)) return o.value as Array<Record<string, unknown>>;
    if (Array.isArray(o.items)) return o.items as Array<Record<string, unknown>>;
    if (o.d && typeof o.d === "object") {
      const d = o.d as Record<string, unknown>;
      if (Array.isArray(d.results)) return d.results as Array<Record<string, unknown>>;
    }
  }
  throw new Error("Unrecognized JSON shape — expected array, { value: [] }, { items: [] }, or { d: { results: [] } }");
}

/**
 * Normalize one raw row into a SapHubContent shape given an EXPLICIT contentType
 * (from the per-type filename). Returns null if there's no usable externalId.
 */
export function normalizeHubRowForType(
  row: Record<string, unknown>,
  contentType: HubContentType,
): NormalizedHubContent | null {
  const externalId = asString(pickField(row, "externalId", "id", "apiId", "eventId", "name", "code")).trim();
  if (!externalId) return null;

  const title = asString(pickField(row, "title", "name", "label", "displayName")) || externalId;
  const description = asString(pickField(row, "description", "whyItMatters", "summary", "shortText"));
  const packageId = asString(pickField(row, "packageId", "package", "lineOfBusiness", "lob", "area")) || null;

  const apiTypeRaw = asString(pickField(row, "apiType", "protocol", "apiProtocol"));
  const apiType = apiTypeRaw ? normalizeHubApiType(apiTypeRaw) : null;

  const idRaw = asString(pickField(row, "externalId", "id", "apiId", "name")) || externalId;
  const hubUrl =
    asString(pickField(row, "hubUrl", "url", "link")) ||
    `https://api.sap.com/${contentType === "API" ? "api" : "content"}/${encodeURIComponent(idRaw)}`;

  /*
   * PRODUCT IDENTITY IS DERIVED FROM THE ROW'S OWN TAG, NEVER DEFAULTED.
   *
   * The old rule was "Scope is S/4 Public — default Public true unless the
   * file says otherwise", and the harvested files never say otherwise: they
   * carry a `product` tag ("SAPS4HANACloudPrivateEdition",
   * "SAPDigitalManufacturingCloud") and no appliesTo* fields. So 500
   * Private-edition BAdIs and every cross-product integration imported as
   * S/4 Public, and the per-product read filter had nothing true to read.
   *
   * Precedence: an explicit appliesTo* field wins (the drop-target shape may
   * declare it); else the product tag is classified with the same mapper the
   * API-catalogue importer has always used; else — no tag, no explicit flag —
   * the row keeps the historical Public default, because the curated
   * drop-target exports are S/4 Public by construction (the README's export
   * instructions filter on that package) and stamping them unknown would
   * evict them from every edition.
   */
  const productTagsRaw = asArray(pickField(row, "product", "products", "productTags"));
  const productTags = productTagsRaw.length > 0 ? productTagsRaw.join(",") : null;
  const explicitPublic = pickField(row, "appliesToPublic", "public");
  const explicitPrivate = pickField(row, "appliesToPrivate", "private");
  const explicitOnPrem = pickField(row, "appliesToOnPrem", "onPrem");
  const hasExplicitEdition =
    explicitPublic !== null || explicitPrivate !== null || explicitOnPrem !== null;
  const derived = productTags !== null ? mapEditionFromProductTags(productTagsRaw) : null;
  const editions = hasExplicitEdition
    ? {
        appliesToPublic: asBool(explicitPublic, true),
        appliesToPrivate: asBool(explicitPrivate, false),
        appliesToOnPrem: asBool(explicitOnPrem, false),
      }
    : derived ?? { appliesToPublic: true, appliesToPrivate: false, appliesToOnPrem: false };

  return {
    contentType,
    externalId,
    title,
    description,
    packageId,
    ...editions,
    productTags,
    status: asString(pickField(row, "status", "releaseStatus", "state")) || "Released",
    apiType,
    communicationScenarios: asArray(pickField(row, "communicationScenarios", "scenarios")),
    scopeItemCodes: asArray(pickField(row, "scopeItemCodes", "scopeItems", "scopeCodes", "businessScenarios")).map((s) => s.toUpperCase()),
    itemCount: asIntOrNull(pickField(row, "itemCount", "count", "total")),
    illustrative: asBool(pickField(row, "illustrative"), false),
    hubUrl,
    rawJson: row,
  };
}

/**
 * Normalize a row whose contentType lives in the row itself (legacy
 * hub-content-seed.json layout). Delegates to normalizeHubRowForType.
 */
export function normalizeHubRow(row: Record<string, unknown>): NormalizedHubContent | null {
  const typeRaw = asString(pickField(row, "contentType", "type", "kind", "category")).toUpperCase().replace(/[\s-]+/g, "_");
  if (!isHubContentType(typeRaw)) return null;
  return normalizeHubRowForType(row, typeRaw);
}
