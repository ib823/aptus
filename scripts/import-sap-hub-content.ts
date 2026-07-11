/**
 * SAP Capability Catalogue importer (Path B, file-based — NO scraping).
 *
 * Reads per-content-type exports dropped in sap-references/ and populates the
 * SapHubContent table (every Business Accelerator Hub content type for S/4HANA
 * Cloud Public Edition). Additive to SapApiReference, which is left untouched.
 *
 * Files (any subset), auto-detected in sap-references/:
 *   hub-content-seed.json       ← the shipped illustrative demo seed
 *   hub-content-<type>.json      ← e.g. hub-content-events.json (real exports)
 *   hub-content.json
 * Or set HUB_IMPORT_FILE=<path> to import one explicit file.
 *
 * JSON shape: a top-level array, or { value: [...] } / { d: { results: [...] } }.
 * Each row needs at least contentType + externalId; other fields are tolerant.
 *
 *   pnpm sap:hub:import
 *   HUB_IMPORT_FILE=path/to/file.json pnpm sap:hub:import
 *   HUB_IMPORT_DRY_RUN=1 pnpm sap:hub:import
 *
 * Idempotent: upsert by (contentType, externalId).
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { HUB_CONTENT_TYPE_META, isHubContentType, type HubContentType } from "../src/lib/sap-public/hub-content";

const prisma = new PrismaClient();

const REF_DIR = "sap-references";
const EXPLICIT_FILE = process.env.HUB_IMPORT_FILE ?? null;
const DRY_RUN = process.env.HUB_IMPORT_DRY_RUN === "1";

export interface NormalizedHubContent {
  contentType: HubContentType;
  externalId: string;
  title: string;
  description: string;
  packageId: string | null;
  appliesToPublic: boolean;
  appliesToPrivate: boolean;
  appliesToOnPrem: boolean;
  status: string;
  apiType: string | null;
  communicationScenarios: string[];
  scopeItemCodes: string[];
  itemCount: number | null;
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

/** Normalize one raw row into a SapHubContent shape, or null if unusable. */
export function normalizeHubRow(row: Record<string, unknown>): NormalizedHubContent | null {
  const typeRaw = asString(pickField(row, "contentType", "type", "kind", "category")).toUpperCase().replace(/[\s-]+/g, "_");
  if (!isHubContentType(typeRaw)) return null;
  const contentType = typeRaw;

  const externalId = asString(pickField(row, "externalId", "id", "apiId", "eventId", "name", "code")).trim();
  if (!externalId) return null;

  const title = asString(pickField(row, "title", "name", "label", "displayName")) || externalId;
  const description = asString(pickField(row, "description", "whyItMatters", "summary", "shortText"));
  const packageId = asString(pickField(row, "packageId", "package", "lineOfBusiness", "lob", "area")) || null;

  const apiTypeRaw = asString(pickField(row, "apiType", "protocol", "apiProtocol"));
  const apiType = apiTypeRaw ? normalizeHubApiType(apiTypeRaw) : null;

  const idRaw = asString(pickField(row, "externalId", "id", "apiId", "name"));
  const hubUrl =
    asString(pickField(row, "hubUrl", "url", "link")) ||
    `https://api.sap.com/${contentType === "API" ? "api" : "content"}/${encodeURIComponent(idRaw)}`;

  return {
    contentType,
    externalId,
    title,
    description,
    packageId,
    // Scope is S/4 Public — default Public true unless the file says otherwise.
    appliesToPublic: asBool(pickField(row, "appliesToPublic", "public"), true),
    appliesToPrivate: asBool(pickField(row, "appliesToPrivate", "private"), false),
    appliesToOnPrem: asBool(pickField(row, "appliesToOnPrem", "onPrem"), false),
    status: asString(pickField(row, "status", "releaseStatus", "state")) || "Released",
    apiType,
    communicationScenarios: asArray(pickField(row, "communicationScenarios", "scenarios")),
    scopeItemCodes: asArray(pickField(row, "scopeItemCodes", "scopeItems", "scopeCodes", "businessScenarios")).map((s) => s.toUpperCase()),
    itemCount: asIntOrNull(pickField(row, "itemCount", "count", "total")),
    hubUrl,
    rawJson: row,
  };
}

function resolveFiles(): string[] {
  if (EXPLICIT_FILE) {
    if (!existsSync(EXPLICIT_FILE)) throw new Error(`HUB_IMPORT_FILE=${EXPLICIT_FILE} does not exist`);
    return [EXPLICIT_FILE];
  }
  const dir = path.resolve(process.cwd(), REF_DIR);
  if (!existsSync(dir)) {
    throw new Error(`No ${REF_DIR}/ directory. Drop hub-content-seed.json (or hub-content-*.json) there.`);
  }
  const files = readdirSync(dir)
    .filter((f) => /^hub-content.*\.json$/i.test(f))
    .map((f) => path.join(dir, f))
    .sort();
  if (files.length === 0) {
    throw new Error(`No hub-content*.json files in ${REF_DIR}/. Ship hub-content-seed.json or drop real exports.`);
  }
  return files;
}

async function main(): Promise<void> {
  const files = resolveFiles();
  console.log(`[import-sap-hub-content] Files: ${files.map((f) => path.basename(f)).join(", ")}`);
  console.log(`[import-sap-hub-content] Dry run: ${DRY_RUN}`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const byType: Record<string, number> = {};

  for (const file of files) {
    const rows = parseHubJson(readFileSync(file, "utf-8"));
    for (const raw of rows) {
      const norm = normalizeHubRow(raw);
      if (!norm) {
        skipped++;
        continue;
      }
      byType[norm.contentType] = (byType[norm.contentType] ?? 0) + 1;

      if (DRY_RUN) {
        inserted++;
        continue;
      }

      const data = {
        title: norm.title,
        description: norm.description,
        packageId: norm.packageId,
        appliesToPublic: norm.appliesToPublic,
        appliesToPrivate: norm.appliesToPrivate,
        appliesToOnPrem: norm.appliesToOnPrem,
        status: norm.status,
        apiType: norm.apiType,
        communicationScenarios: norm.communicationScenarios,
        scopeItemCodes: norm.scopeItemCodes,
        itemCount: norm.itemCount,
        hubUrl: norm.hubUrl,
        rawMetadataJson: norm.rawJson as Prisma.InputJsonValue,
      };
      const existing = await prisma.sapHubContent.findUnique({
        where: { contentType_externalId: { contentType: norm.contentType, externalId: norm.externalId } },
        select: { id: true },
      });
      if (existing) {
        await prisma.sapHubContent.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.sapHubContent.create({
          data: { contentType: norm.contentType, externalId: norm.externalId, ...data },
        });
        inserted++;
      }
    }
  }

  // Backfill API scope codes from SapApiReference (non-clobbering: only fill
  // rows the export left empty; matched by apiId == externalId).
  let scopeBackfilled = 0;
  if (!DRY_RUN) {
    const apiRows = await prisma.sapHubContent.findMany({
      where: { contentType: "API", scopeItemCodes: { isEmpty: true } },
      select: { id: true, externalId: true },
    });
    for (const r of apiRows) {
      const ref = await prisma.sapApiReference.findUnique({
        where: { apiId: r.externalId },
        select: { scopeItemCodes: true },
      });
      if (ref && ref.scopeItemCodes.length > 0) {
        await prisma.sapHubContent.update({ where: { id: r.id }, data: { scopeItemCodes: ref.scopeItemCodes } });
        scopeBackfilled++;
      }
    }
  }

  console.log("\n[import-sap-hub-content] === Import complete ===");
  if (scopeBackfilled > 0) console.log(`  Scope codes backfilled from SapApiReference: ${scopeBackfilled}`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log("  By content type:");
  for (const t of Object.keys(HUB_CONTENT_TYPE_META)) {
    if (byType[t]) console.log(`    ${t.padEnd(18)} ${byType[t]}`);
  }

  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    void prisma.$disconnect();
    process.exit(1);
  });
}
