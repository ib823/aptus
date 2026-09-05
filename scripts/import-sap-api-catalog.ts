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

// ── Normalization: SHARED with the deployed admin import ────────────────────
// The pure pieces (NormalizedApi, normalizeRow, parseJson, normalizeStatus,
// normalizeApiType) moved to src/lib/sap-public/api-reference-import.ts so the
// Catalogue Health guided refresh runs the SAME import a laptop does — two
// copies would re-diverge the way the two tag dialects once did. Re-exported
// here so existing callers and tests keep working.
export {
  normalizeApiType,
  normalizeRow,
  normalizeStatus,
  parseJson,
  type NormalizedApi,
} from "../src/lib/sap-public/api-reference-import";
import { normalizeRow, parseJson } from "../src/lib/sap-public/api-reference-import";
import { apiLifecycleFields } from "../src/lib/sap-public/api-reference-import";

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

// ── Edition tagging from product tags ───────────────────────────────────────
// MOVED to src/lib/sap-public/edition-tags.ts and re-exported here, because the
// runtime import path (hub-import.ts) needed the same classifier this script
// has always had — two copies would re-diverge the way the two tag dialects
// did. The existing tests importing from this module keep working.
export { mapEditionFromProductTags, splitProductTag } from "../src/lib/sap-public/edition-tags";
import { mapEditionFromProductTags } from "../src/lib/sap-public/edition-tags";

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
      // 2608 WS2 — the Hub's lifecycle fields, verbatim.
      ...apiLifecycleFields(norm),
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
