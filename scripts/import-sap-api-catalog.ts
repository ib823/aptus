/**
 * Phase 13.6 — SAP API Catalog importer (Path B).
 *
 * Reads a CSV or JSON export of the SAP API Business Hub catalog (the file
 * you download from api.sap.com after logging in) and populates the
 * SapApiReference table. No network calls — pure file-based.
 *
 * ============================================================================
 * HOW TO GET THE EXPORT FILE
 * ============================================================================
 * 1. Open https://api.sap.com in a browser
 * 2. Log in with an SAP Universal ID (free) or S-User
 * 3. Browse to the API catalog (top nav → "APIs")
 * 4. Filter by product if desired (S/4HANA Cloud, S/4HANA Cloud private edition)
 * 5. Use the export / download button (UI varies — typically top-right of the
 *    catalog list view; if absent, copy the JSON response from your browser's
 *    DevTools Network tab while filtering)
 * 6. Save the export to: sap-references/api-hub-catalog.{csv,json}
 *    (this directory is gitignored — see scripts/ingest/README.md)
 *
 * ============================================================================
 * SUPPORTED FORMATS
 * ============================================================================
 * CSV:  header row required; column names are matched case-insensitively
 *       and tolerate underscores/spaces/camelCase.
 * JSON: top-level array of objects, OR { value: [...] } / { d: { results: [...] } }
 *       (matches OData v2/v4 wire format if you copy-paste from DevTools)
 *
 * ============================================================================
 * MINIMUM REQUIRED COLUMNS / FIELDS (any one of each row)
 * ============================================================================
 *   API ID         (apiId / Id / Name / API_ID / "API ID" / id)        — REQUIRED
 *   API Name       (apiName / title / Title / "API Name" / name)        — recommended
 *   Status         (status / ReleaseStatus / "Release Status" / state) — recommended
 *   Product        (productCategory / productLine / product / category) — used for edition tagging
 *
 * Optional:
 *   Description    — used in the user message to Claude
 *   Scope Items    (scopeItems / ScopeItemIds / "Business Scenarios" / linkedScopeItems)
 *   Comm Scenarios (communicationScenarios / "Communication Scenarios")
 *   API Hub URL    (url / apiHubUrl / link)
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *   pnpm tsx scripts/import-sap-api-catalog.ts
 *   IMPORT_FILE=path/to/file.json pnpm tsx scripts/import-sap-api-catalog.ts
 *   IMPORT_DRY_RUN=1 pnpm tsx scripts/import-sap-api-catalog.ts
 *
 * Idempotent: re-runs upsert by apiId. Existing rows are updated.
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const DEFAULT_IMPORT_PATHS = [
  "sap-references/api-hub-catalog.json",
  "sap-references/api-hub-catalog.csv",
  "sap-references/api-catalog.json",
  "sap-references/api-catalog.csv",
];
const IMPORT_FILE = process.env.IMPORT_FILE ?? null;
const DRY_RUN = process.env.IMPORT_DRY_RUN === "1";
const VERBOSE = process.env.IMPORT_VERBOSE === "1";

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

// ── File detection ──────────────────────────────────────────────────────────
function resolveImportPath(): string {
  if (IMPORT_FILE) {
    if (!existsSync(IMPORT_FILE)) {
      throw new Error(`IMPORT_FILE=${IMPORT_FILE} does not exist`);
    }
    return IMPORT_FILE;
  }
  for (const candidate of DEFAULT_IMPORT_PATHS) {
    const absolute = path.resolve(process.cwd(), candidate);
    if (existsSync(absolute)) return absolute;
  }
  throw new Error(
    `No import file found. Either set IMPORT_FILE=<path> env or place the export at one of:\n  ${DEFAULT_IMPORT_PATHS.join("\n  ")}`,
  );
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

// ── Edition tagging from product tags ───────────────────────────────────────
// Each "tag" may itself be a multi-product string SAP concatenates with
// ";" or "," (we observed `"S/4HANA Cloud, private edition; SAP S/4HANA Cloud"`
// in synthetic fixtures and likely in real exports). Split on those before
// classifying so a single field declaring both editions tags both.
function splitProductTag(raw: string): string[] {
  /*
   * A COMMA MEANS TWO DIFFERENT THINGS AND BOTH APPEAR IN REAL DATA.
   *
   * The human export writes "SAP S/4HANA Cloud, private edition" — there the
   * comma introduces a QUALIFIER of the product before it. The Hub's own OData
   * writes "SAPS4HANA,SAPS4HANACloudPrivateEdition" — there it separates TWO
   * products, and refusing to split it cost every one of those rows its
   * edition: 547 APIs in the 2026-07-30 harvest carry exactly that tag.
   *
   * So split on the comma, then re-attach any part that begins with a bare
   * qualifier, which is the only case the human form produces.
   */
  const rough = raw
    .split(/\s*;\s*|\s*\|\s*|\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const part of rough) {
    const isBareQualifier = /^(private|public)\b/i.test(part);
    if (isBareQualifier && parts.length > 0) {
      parts[parts.length - 1] = `${parts[parts.length - 1]}, ${part}`;
    } else {
      parts.push(part);
    }
  }
  return parts.length > 0 ? parts : [raw.trim()];
}

function classifyOneTag(t: string): {
  isPublic: boolean;
  isPrivate: boolean;
  isOnPrem: boolean;
} {
  const lower = t.toLowerCase();
  /*
   * TWO SPELLINGS OF EVERY PRODUCT NAME. A downloaded export writes them for
   * people — "SAP S/4HANA Cloud, private edition". The Hub's OData writes them
   * for machines — "SAPS4HANACloudPrivateEdition", with no spaces and no
   * slash. Matching only the readable form tagged 4568 of 4597 harvested APIs
   * as "no edition", which reads exactly like "SAP publishes nothing here".
   *
   * So every needle is tested against both, with the same punctuation removed
   * from the needle as from the tag.
   */
  const compact = lower.replace(/[\s/,._-]/g, "");
  const has = (...needles: string[]) =>
    needles.some(
      (n) => lower.includes(n) || compact.includes(n.replace(/[\s/,._-]/g, "")),
    );

  const isPrivate = has(
    "private edition",
    "private cloud",
    "rise with sap",
    "s/4hana cloud, private",
  );
  const isPublic =
    has("public edition", "public cloud", "s/4hana cloud, public", "multi-tenant") ||
    // Bare "S/4HANA Cloud" with no private qualifier → Public (historical SAP convention)
    (has("s/4hana cloud") && !isPrivate);
  const isOnPrem =
    has("on premise", "on-premise", "on-prem") ||
    // Bare "SAP S/4HANA" without "Cloud" qualifier → On-Premise per SAP
    // taxonomy. Tested on the COMPACT form, so "SAPS4HANACloud" is correctly
    // excluded by its own "cloud" rather than slipping through on spacing.
    (has("s/4hana") && !compact.includes("cloud"));
  return { isPublic, isPrivate, isOnPrem };
}

export function mapEditionFromProductTags(tags: string[]): {
  appliesToPublic: boolean;
  appliesToPrivate: boolean;
  appliesToOnPrem: boolean;
} {
  let appliesToPublic = false;
  let appliesToPrivate = false;
  let appliesToOnPrem = false;
  for (const raw of tags) {
    for (const part of splitProductTag(raw)) {
      const { isPublic, isPrivate, isOnPrem } = classifyOneTag(part);
      if (isPublic) appliesToPublic = true;
      if (isPrivate) appliesToPrivate = true;
      if (isOnPrem) appliesToOnPrem = true;
    }
  }
  return { appliesToPublic, appliesToPrivate, appliesToOnPrem };
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

// ── CSV parser (RFC 4180-compliant, no external deps) ────────────────────────
function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && next === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return rows
    .filter((r) => r.some((c) => c.trim().length > 0))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = (r[i] ?? "").trim();
      });
      return obj;
    });
}

// ── JSON parser (handles array, OData v2, OData v4) ─────────────────────────
export function parseJson(text: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    /*
     * `{ _provenance, apis: [...] }` — WHAT THE HARVESTER ACTUALLY WRITES.
     *
     * Its header has claimed since it shipped that it "writes the shape
     * import-sap-api-catalog.ts already accepts", and it never did: this
     * function knew `value` and `d.results` but not `apis`, so the documented
     * two-step flow (harvest, then import) failed on the second step every
     * time with "Unrecognized JSON shape".
     *
     * It went unseen because nothing exercised the chain. The tests that read
     * the harvested file call `mapEditionFromProductTags` directly, so they
     * pass while the workflow they appear to cover is broken — which also
     * means `productTags` and every edition flag re-derived by an import have
     * never once been populated from a harvest on any database.
     */
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
// Exported (with the pure mappers above) so tests can exercise the field
// mapping without touching prisma or the filesystem.
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

// ── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const filePath = resolveImportPath();
  console.log(`[import-sap-api-catalog] Reading: ${filePath}`);
  console.log(`[import-sap-api-catalog] Dry run: ${DRY_RUN}`);

  const ext = path.extname(filePath).toLowerCase();
  const raw = readFileSync(filePath, "utf-8");
  let rows: Array<Record<string, unknown>>;
  if (ext === ".json") {
    rows = parseJson(raw);
  } else if (ext === ".csv") {
    rows = parseCsv(raw);
  } else {
    // Auto-detect by content
    const trimmed = raw.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      rows = parseJson(raw);
    } else {
      rows = parseCsv(raw);
    }
  }
  console.log(`[import-sap-api-catalog] Parsed rows: ${rows.length}`);

  let inserted = 0;
  let updated = 0;
  const unchanged = 0;
  let skipped = 0;
  let publicCount = 0;
  let privateCount = 0;
  let onPremCount = 0;
  let bothEditions = 0;
  let untaggedEdition = 0;

  for (const row of rows) {
    const norm = normalizeRow(row);
    if (!norm) {
      skipped++;
      if (VERBOSE) console.warn(`  skip — no apiId in row: ${JSON.stringify(row).slice(0, 100)}`);
      continue;
    }
    const editions = mapEditionFromProductTags(norm.productTags);
    if (editions.appliesToPublic) publicCount++;
    if (editions.appliesToPrivate) privateCount++;
    if (editions.appliesToOnPrem) onPremCount++;
    if (editions.appliesToPublic && editions.appliesToPrivate) bothEditions++;
    if (!editions.appliesToPublic && !editions.appliesToPrivate && !editions.appliesToOnPrem) {
      untaggedEdition++;
      if (VERBOSE) console.warn(`  ${norm.apiId} — no edition determined from tags: [${norm.productTags.join(", ")}]`);
    }

    const data = {
      apiId: norm.apiId,
      apiName: norm.apiName,
      description: norm.description,
      status: norm.status,
      category: norm.category,
      appliesToPublic: editions.appliesToPublic,
      appliesToPrivate: editions.appliesToPrivate,
      appliesToOnPrem: editions.appliesToOnPrem,
      productTags: norm.productTagsRaw,
      // Only write apiType when the file declares one. Omitting it on re-import
      // preserves any value scripts/ingest/refresh-api-types.ts backfilled.
      ...(norm.apiType ? { apiType: norm.apiType } : {}),
      scopeItemCodes: norm.scopeItemCodes,
      communicationScenarios: norm.communicationScenarios,
      apiHubUrl: norm.apiHubUrl,
      rawMetadataJson: norm.rawJson as Prisma.InputJsonValue,
      etag: null,
      lastFetchedAt: new Date(),
    };

    if (DRY_RUN) {
      console.log(`  DRY: ${norm.apiId.padEnd(40)} ${norm.status.padEnd(11)} pub=${editions.appliesToPublic ? "Y" : "."} priv=${editions.appliesToPrivate ? "Y" : "."} scopes=${norm.scopeItemCodes.length}`);
      inserted++;
      continue;
    }

    const existing = await prisma.sapApiReference.findUnique({
      where: { apiId: norm.apiId },
      select: { id: true },
    });
    if (existing) {
      await prisma.sapApiReference.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.sapApiReference.create({ data });
      inserted++;
    }

    if ((inserted + updated) % 100 === 0 && (inserted + updated) > 0) {
      console.log(`  ... ${inserted + updated}/${rows.length}`);
    }
  }

  console.log("\n[import-sap-api-catalog] === Import complete ===");
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Edition tagging:`);
  console.log(`    Public:    ${publicCount}`);
  console.log(`    Private:   ${privateCount}`);
  console.log(`    On-Prem:   ${onPremCount}`);
  console.log(`    Both Pub+Priv: ${bothEditions}`);
  console.log(`    Untagged (no edition determined): ${untaggedEdition}`);

  if (untaggedEdition > 0) {
    console.warn(
      `\n[import-sap-api-catalog] ${untaggedEdition} APIs have no edition tag — they will not surface in classifier grounding ` +
      `until tagged. Re-run with IMPORT_VERBOSE=1 to see which APIs and which tags they had.`,
    );
  }

  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
