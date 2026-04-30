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

import { PrismaClient, Prisma } from "@prisma/client";
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
interface NormalizedApi {
  apiId: string;
  apiName: string;
  description: string;
  status: string;
  category: string | null;
  productTags: string[]; // raw product / category strings for edition mapping
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
  // Don't split on ", " when it's part of a known SAP product name like
  // "SAP S/4HANA Cloud, private edition" — we look for the explicit delimiter
  // ";" first, falling back to "; " or " | " or newlines.
  const parts = raw.split(/\s*;\s*|\s*\|\s*|\n/g).map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [raw.trim()];
}

function classifyOneTag(t: string): {
  isPublic: boolean;
  isPrivate: boolean;
  isOnPrem: boolean;
} {
  const lower = t.toLowerCase();
  const isPrivate =
    lower.includes("private edition") ||
    lower.includes("private cloud") ||
    lower.includes("rise with sap") ||
    lower.includes("s/4hana cloud, private");
  const isPublic =
    lower.includes("public edition") ||
    lower.includes("public cloud") ||
    lower.includes("s/4hana cloud, public") ||
    lower.includes("multi-tenant") ||
    // Bare "S/4HANA Cloud" with no private qualifier → Public (historical SAP convention)
    (lower.includes("s/4hana cloud") && !isPrivate);
  const isOnPrem =
    lower.includes("on premise") ||
    lower.includes("on-premise") ||
    lower.includes("on-prem");
  return { isPublic, isPrivate, isOnPrem };
}

function mapEditionFromProductTags(tags: string[]): {
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

function normalizeStatus(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("released")) return "Released";
  if (lower.includes("beta")) return "Beta";
  if (lower.includes("deprecat")) return "Deprecated";
  return raw || "Unknown";
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
function parseJson(text: string): Array<Record<string, unknown>> {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.value)) return o.value as Array<Record<string, unknown>>;
    if (o.d && typeof o.d === "object") {
      const d = o.d as Record<string, unknown>;
      if (Array.isArray(d.results)) return d.results as Array<Record<string, unknown>>;
    }
  }
  throw new Error("Unrecognized JSON shape — expected array, { value: [] }, or { d: { results: [] } }");
}

// ── Normalize one parsed row ────────────────────────────────────────────────
function normalizeRow(row: Record<string, unknown>): NormalizedApi | null {
  const apiIdRaw = pickField(row, "apiId", "Id", "ID", "Name", "API_ID", "API ID", "id");
  if (!apiIdRaw) return null;
  const apiId = asString(apiIdRaw).trim();
  if (!apiId) return null;

  const apiName = asString(pickField(row, "apiName", "title", "Title", "API Name", "name", "label"));
  const description = asString(pickField(row, "description", "Description", "shortText", "summary"));
  const statusRaw = asString(pickField(row, "status", "ReleaseStatus", "Release Status", "state", "lifecycle"));
  const category = asString(pickField(row, "category", "Category", "businessArea", "Business Area"));
  const product1 = asString(pickField(row, "productCategory", "ProductCategory", "Product Category"));
  const product2 = asString(pickField(row, "productLine", "ProductLine", "Product Line"));
  const product3 = asString(pickField(row, "product", "Product"));
  const productTags = [product1, product2, product3, category].filter(Boolean);

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
    category: category || null,
    productTags,
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
  let unchanged = 0;
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
