/**
 * SAP Capability Catalogue importer (Path B, file-based — NO scraping).
 *
 * Reads Business Accelerator Hub exports dropped in sap-references/ and populates
 * the SapHubContent table (every content type for S/4HANA Cloud Public Edition).
 * Additive to SapApiReference, which is left untouched. LOCAL/dev only (direct
 * DATABASE_URL). Prod is populated via the admin Rebuild endpoint (bundled files).
 *
 * Two layouts, both auto-detected:
 *   sap-references/hub-content/<TYPE>.json   ← per-type; contentType from filename
 *                                              (EVENT.json, CDS_VIEW.json, …)
 *   sap-references/hub-content*.json          ← legacy; contentType from each row
 * Or set HUB_IMPORT_FILE=<path> to import one explicit legacy file.
 *
 * JSON shape: a top-level array, or { value: [...] } / { items: [...] } /
 * { d: { results: [...] } }. Each row needs at least a usable externalId.
 *
 *   pnpm sap:hub:import
 *   HUB_IMPORT_FILE=path/to/file.json pnpm sap:hub:import
 *   HUB_IMPORT_DRY_RUN=1 pnpm sap:hub:import
 *
 * Idempotent: upsert by (contentType, externalId). Never deletes/mutates API rows.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { HUB_CONTENT_TYPE_META, isHubContentType, type HubContentType } from "../src/lib/sap-public/hub-content";
import {
  normalizeHubRow,
  normalizeHubRowForType,
  parseHubJson,
  type NormalizedHubContent,
} from "../src/lib/sap-public/hub-import";

const prisma = new PrismaClient();

const REF_DIR = "sap-references";
const PER_TYPE_DIR = path.join(REF_DIR, "hub-content");
/** Individual artifacts from the Hub harvest — never bundled, see resolveSources. */
const HARVEST_DIR = path.join(REF_DIR, "hub-harvest");
const EXPLICIT_FILE = process.env.HUB_IMPORT_FILE ?? null;
const DRY_RUN = process.env.HUB_IMPORT_DRY_RUN === "1";

/** A file to import + the content type to stamp (null = read it from each row). */
interface ImportSource {
  file: string;
  contentType: HubContentType | null;
}

function resolveSources(): ImportSource[] {
  if (EXPLICIT_FILE) {
    if (!existsSync(EXPLICIT_FILE)) throw new Error(`HUB_IMPORT_FILE=${EXPLICIT_FILE} does not exist`);
    return [{ file: EXPLICIT_FILE, contentType: null }];
  }
  const sources: ImportSource[] = [];

  /*
   * 1) Per-type files, from BOTH directories, curated first.
   *
   *   hub-content/  — hand-curated rows, often GROUPED (one `S4HANACloudBADI`
   *                   standing for a thousand BAdIs). Small, and statically
   *                   imported by hub-content-bundled.ts for the admin Rebuild.
   *   hub-harvest/  — individual artifacts from scripts/harvest-sap-api-hub.ts.
   *                   Large, and deliberately NEVER statically imported, so it
   *                   cannot reach the serverless bundle.
   *
   * They key differently — grouped id versus artifact id — so both survive the
   * upsert rather than one erasing the other. Writing the harvest into the
   * curated files instead destroyed 158 integrations and 77 builds before this
   * split existed.
   */
  for (const dir of [PER_TYPE_DIR, HARVEST_DIR]) {
    const abs = path.resolve(process.cwd(), dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter((f) => f.toLowerCase().endsWith(".json")).sort()) {
      const typeRaw = path.basename(f, path.extname(f)).toUpperCase().replace(/[\s-]+/g, "_");
      if (isHubContentType(typeRaw)) sources.push({ file: path.join(abs, f), contentType: typeRaw });
    }
  }

  // 2) Legacy root files: sap-references/hub-content*.json → contentType per row.
  const dir = path.resolve(process.cwd(), REF_DIR);
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((f) => /^hub-content.*\.json$/i.test(f)).sort()) {
      sources.push({ file: path.join(dir, f), contentType: null });
    }
  }

  if (sources.length === 0) {
    throw new Error(
      `No hub-content sources. Drop per-type files in ${PER_TYPE_DIR}/<TYPE>.json or legacy hub-content*.json in ${REF_DIR}/.`,
    );
  }
  return sources;
}

async function main(): Promise<void> {
  const sources = resolveSources();
  const importedAt = new Date().toISOString();
  console.log(`[import-sap-hub-content] Sources: ${sources.map((s) => path.basename(s.file)).join(", ")}`);
  console.log(`[import-sap-hub-content] Dry run: ${DRY_RUN}`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  // Illustrative rows refused because a REAL row already holds that key.
  let skippedReal = 0;
  const byType: Record<string, number> = {};

  for (const src of sources) {
    const rows = parseHubJson(readFileSync(src.file, "utf-8"));
    const label = path.basename(src.file);
    for (const raw of rows) {
      const norm: NormalizedHubContent | null = src.contentType
        ? normalizeHubRowForType(raw, src.contentType)
        : normalizeHubRow(raw);
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
        illustrative: norm.illustrative,
        hubUrl: norm.hubUrl,
        // Provenance: which file, when. release is intentionally NOT pinned — the
        // published counts are indicative volume, not a release-accurate snapshot.
        rawMetadataJson: { source: label, release: null, importedAt, raw: norm.rawJson } as Prisma.InputJsonValue,
      };
      const existing = await prisma.sapHubContent.findUnique({
        where: { contentType_externalId: { contentType: norm.contentType, externalId: norm.externalId } },
        select: { id: true, illustrative: true },
      });
      if (existing) {
        /*
         * AN ILLUSTRATIVE ROW MUST NOT REPLACE A REAL ONE.
         *
         * The seed file and real exports upsert into the same table on the same
         * key, so WHICHEVER RAN LAST WON — and the seed carries placeholder
         * titles and descriptions for ids that are genuinely published, ten of
         * them on a populated catalogue including API_BUSINESS_PARTNER. Running
         * the seed after a real import silently replaced activated content with
         * demo text and stamped it `illustrative`, so the console showed a
         * placeholder badge on an API the tenant actually uses.
         *
         * The order of two imports is not something an operator should have to
         * know, so the rule is direction-based instead: real content is never
         * demoted. The reverse — a real import overwriting a placeholder — is
         * the whole point of importing, and still happens.
         */
        if (norm.illustrative && existing.illustrative === false) {
          skippedReal++;
          continue;
        }
        await prisma.sapHubContent.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.sapHubContent.create({ data: { contentType: norm.contentType, externalId: norm.externalId, ...data } });
        inserted++;
      }
    }
  }

  // Backfill API scope codes from SapApiReference (non-clobbering: only fill rows
  // the export left empty; matched by apiId == externalId). Reads API rows; never
  // mutates SapApiReference.
  let scopeBackfilled = 0;
  if (!DRY_RUN) {
    const apiRows = await prisma.sapHubContent.findMany({
      where: { contentType: "API", scopeItemCodes: { isEmpty: true } },
      select: { id: true, externalId: true },
    });
    for (const r of apiRows) {
      const ref = await prisma.sapApiReference.findUnique({ where: { apiId: r.externalId }, select: { scopeItemCodes: true } });
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
  if (skippedReal > 0) {
    // Loud, because silence here is what let the seed quietly demote real rows.
    console.log(`  Kept real (illustrative row refused): ${skippedReal}`);
  }
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
