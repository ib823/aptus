/**
 * Brownfield SIC adapter — ingests an SAP Simplification Item Catalog
 * archive into Aptus's BrownfieldCatalogVersion + child tables.
 *
 * Source: the .zip download from launchpad.support.sap.com/#sic, e.g.
 * `SimplificationItemCatalog20260503.zip`. Contains 21 ABAP-XML files
 * (header.xml, sdb_transition_db_item.xml, sdb_check_new.xml,
 * sdb_note.xml, sdb_lob.xml, sdb_application_area.xml, …).
 *
 * Idempotent: same archive (matched by sha256 hash) is a no-op on re-run.
 *
 * Usage:
 *   $ pnpm tsx scripts/ingest/brownfield-sic-adapter.ts \
 *       /workspaces/aptus/Conversion/SimplificationItemCatalog20260503.zip
 */

import { createHash } from "crypto";
import { readFile } from "fs/promises";
import AdmZip from "adm-zip";
import { prisma } from "../../src/lib/db/prisma";

// -------------------------------------------------------------
// XML record extraction (ABAP-XML is flat / non-nested in records)
// -------------------------------------------------------------

/** Pull every `<RECORD>...</RECORD>` block from an XML string. */
function extractRecords(xml: string, recordTag: string): string[] {
  const rx = new RegExp(`<${recordTag}>([\\s\\S]*?)</${recordTag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(xml)) !== null) out.push(m[1] ?? "");
  return out;
}

/** Extract the text content of a single child element from a flat record. */
function getField(record: string, name: string): string | null {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(record);
  if (!m) {
    // Self-closing form: <NAME/>
    if (new RegExp(`<${name}/>`).test(record)) return null;
    return null;
  }
  // Decode common XML entities
  return m[1]!
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function getInt(record: string, name: string): number | null {
  const v = getField(record, name);
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// -------------------------------------------------------------
// Per-file parsers
// -------------------------------------------------------------

interface HeaderFacts {
  snapshotDate: Date;
  applicationVersion: string | null;
  sourceSystemId: string | null;
}

function parseHeader(xml: string, archiveBaseName: string): HeaderFacts {
  // Pairs of <NAME>k</NAME><VALUE>v</VALUE>
  const pairs = extractRecords(xml, "_-IWBEP_-S_MGW_NAME_VALUE_PAIR");
  const map = new Map<string, string>();
  for (const p of pairs) {
    const k = getField(p, "NAME");
    const v = getField(p, "VALUE");
    if (k && v !== null) map.set(k.trim(), v.trim());
  }
  // TransitionDBDownloadedTimeUTC is "20260503030539.1709340 " (yyyyMMddHHmmss.fff)
  let snapshotDate = new Date();
  const ts = map.get("TransitionDBDownloadedTimeUTC");
  if (ts) {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(ts.trim());
    if (m) {
      snapshotDate = new Date(
        Date.UTC(
          Number(m[1]), Number(m[2]) - 1, Number(m[3]),
          Number(m[4]), Number(m[5]), Number(m[6]),
        ),
      );
    }
  } else {
    // Fall back to filename: SimplificationItemCatalog20260503.zip
    const m = /(\d{4})(\d{2})(\d{2})/.exec(archiveBaseName);
    if (m) snapshotDate = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  return {
    snapshotDate,
    applicationVersion: map.get("TransitionDBApplicationVersion") ?? null,
    sourceSystemId: map.get("TransitionDBDownloadedSystem") ?? null,
  };
}

interface SitemRow {
  sapGuid: string;
  sitemId: string;
  titleEn: string;
  applicationArea: string;
  procStatus: string;
  procStatusTextEn: string;
  checkCondition: string | null;
  impactNote: string | null;
  businessAreaGuid: string | null;
  lobTechnologyGuid: string | null;
  startRelValidFromPrdVer: string | null;
  startRelValidFromStack: string | null;
  startRelValidToPrdVer: string | null;
  startRelValidToStack: string | null;
  referGuid: string | null;
  copyGuid: string | null;
  copyStatus: string | null;
  createdBySap: string | null;
  changedBySap: string | null;
}

function parseSitems(xml: string): SitemRow[] {
  const records = extractRecords(xml, "GSS_RC_SIC_DOWNLOAD_SITEM");
  return records.flatMap((r): SitemRow[] => {
    const sapGuid = getField(r, "GUID");
    const titleEn = getField(r, "TITLE_EN");
    const sitemId = getField(r, "SITEM_ID");
    if (!sapGuid || !titleEn) return [];
    return [{
      sapGuid,
      sitemId: sitemId ?? "(no SITEM_ID)",
      titleEn,
      applicationArea: getField(r, "APP_AREA") ?? "Unknown",
      procStatus: getField(r, "PROC_STATUS") ?? "?",
      procStatusTextEn: getField(r, "PROC_STATUS_TEXT_EN") ?? "?",
      checkCondition: getField(r, "CHECK_CONDITION"),
      impactNote: getField(r, "IMPACT_NOTE"),
      businessAreaGuid: getField(r, "BUSINESS_AREA"),
      lobTechnologyGuid: getField(r, "LOB_TECHNOLOGY"),
      startRelValidFromPrdVer: getField(r, "START_REL_VALID_FROM_PRD_VER"),
      startRelValidFromStack: getField(r, "START_REL_VALID_FROM_STACK"),
      startRelValidToPrdVer: getField(r, "START_REL_VALID_TO_PRD_VER"),
      startRelValidToStack: getField(r, "START_REL_VALID_TO_STACK"),
      referGuid: getField(r, "REFER_GUID"),
      copyGuid: getField(r, "COPY_GUID"),
      copyStatus: getField(r, "COPY_STATUS"),
      createdBySap: getField(r, "CREATED_BY"),
      changedBySap: getField(r, "CHANGED_BY"),
    }];
  });
}

interface CheckRow {
  sitemGuid: string;
  checkGuid: string;
  checkType: string;
  checkIdentifier: string;
  checkSubIdentifier: string | null;
  sapNote: string | null;
  checkCountOption: string | null;
  checkCount: number | null;
  checkClassUsage: string | null;
  bfChkState: string | null;
  checkCondition: string | null;
}

function parseChecks(xml: string): CheckRow[] {
  const records = extractRecords(xml, "item");
  return records.flatMap((r): CheckRow[] => {
    const sitemGuid = getField(r, "SITEM_GUID");
    const checkGuid = getField(r, "CHECK_GUID");
    if (!sitemGuid || !checkGuid) return [];
    return [{
      sitemGuid,
      checkGuid,
      checkType: getField(r, "CHECK_TYPE") ?? "?",
      checkIdentifier: getField(r, "CHECK_IDENTIFIER") ?? "?",
      checkSubIdentifier: getField(r, "CHECK_SUB_IDENTIFIER"),
      sapNote: getField(r, "SAP_NOTE"),
      checkCountOption: getField(r, "CHECK_COUNT_OPTION"),
      checkCount: getInt(r, "CHECK_COUNT"),
      checkClassUsage: getField(r, "CHECK_CLASS_USAGE"),
      bfChkState: getField(r, "BF_CHK_STATE"),
      checkCondition: getField(r, "CHECK_CONDITION"),
    }];
  });
}

interface NoteRow {
  noteGuid: string;
  sitemGuid: string | null;
  noteType: string;
  noteTypeTextEn: string | null;
  sapNote: string;
}

function parseNotes(xml: string): NoteRow[] {
  const records = extractRecords(xml, "V_SIC_NOTE");
  return records.flatMap((r): NoteRow[] => {
    const noteGuid = getField(r, "GUID");
    const sapNote = getField(r, "SAP_NOTE");
    if (!noteGuid || !sapNote) return [];
    return [{
      noteGuid,
      // sitemGuid is not present in V_SIC_NOTE — these are catalog-wide notes.
      // Resolution to a specific item happens via the IMPACT_NOTE column on
      // SimplificationItem (which holds the sapNote ID, not a GUID).
      sitemGuid: null,
      noteType: getField(r, "NOTE_TYPE") ?? "?",
      noteTypeTextEn: getField(r, "NOTE_TYPE_TEXT_EN"),
      sapNote,
    }];
  });
}

interface LobRow {
  sapId: string;
  name: string;
  type: string;
  owningContextId: string | null;
  parentSapId: string | null;
  status: string | null;
  lifecycleStatus: string | null;
  rank: number | null;
}

function parseLobs(xml: string): LobRow[] {
  const records = extractRecords(xml, "GSS_RC_SMDB_LOB");
  return records.flatMap((r): LobRow[] => {
    const sapId = getField(r, "ID");
    const name = getField(r, "NAME");
    if (!sapId || !name) return [];
    return [{
      sapId,
      name,
      type: getField(r, "TYPE") ?? "?",
      owningContextId: getField(r, "OWNING_CONTEXT_ID"),
      parentSapId: getField(r, "PARENT"),
      status: getField(r, "STATUS"),
      lifecycleStatus: getField(r, "LIFECYCLE_STATUS"),
      rank: getInt(r, "RANK"),
    }];
  });
}

interface AreaRow {
  areaKey: string;
  areaName: string;
}

function parseAreas(xml: string): AreaRow[] {
  const records = extractRecords(xml, "V_SIC_APP_AREA");
  return records.flatMap((r): AreaRow[] => {
    const areaKey = getField(r, "AREA_KEY");
    const areaName = getField(r, "AREA");
    if (!areaKey || !areaName) return [];
    return [{ areaKey, areaName }];
  });
}

// -------------------------------------------------------------
// Ingest orchestrator
// -------------------------------------------------------------

async function readZipEntry(zip: AdmZip, name: string): Promise<string> {
  const entry = zip.getEntry(name);
  if (!entry) throw new Error(`SIC archive missing required entry: ${name}`);
  return entry.getData().toString("utf8");
}

export async function runBrownfieldSicIngest(archivePath: string): Promise<void> {
  console.log(`[brownfield-sic] Reading ${archivePath}`);
  const buf = await readFile(archivePath);
  const sourceArchiveHash = createHash("sha256").update(buf).digest("hex");
  console.log(`[brownfield-sic] sha256=${sourceArchiveHash}`);

  const existing = await prisma.brownfieldCatalogVersion.findUnique({
    where: { sourceArchiveHash },
  });
  if (existing) {
    console.log(
      `[brownfield-sic] Catalog already ingested as ${existing.id} (snapshotDate ${existing.snapshotDate.toISOString()}). No-op.`,
    );
    return;
  }

  const zip = new AdmZip(buf);
  const archiveBaseName = archivePath.split(/[/\\]/).pop() ?? "";

  const headerXml = await readZipEntry(zip, "header.xml");
  const sitemXml = await readZipEntry(zip, "sdb_transition_db_item.xml");
  const checkXml = await readZipEntry(zip, "sdb_check_new.xml");
  const noteXml = await readZipEntry(zip, "sdb_note.xml");
  const lobXml = await readZipEntry(zip, "sdb_lob.xml");
  const areaXml = await readZipEntry(zip, "sdb_application_area.xml");

  const header = parseHeader(headerXml, archiveBaseName);
  const sitems = parseSitems(sitemXml);
  const checks = parseChecks(checkXml);
  const notes = parseNotes(noteXml);
  const lobs = parseLobs(lobXml);
  const areas = parseAreas(areaXml);

  console.log(
    `[brownfield-sic] Parsed: sitems=${sitems.length} checks=${checks.length} notes=${notes.length} lobs=${lobs.length} areas=${areas.length}`,
  );

  // Create catalog version
  const catalog = await prisma.brownfieldCatalogVersion.create({
    data: {
      snapshotDate: header.snapshotDate,
      applicationVersion: header.applicationVersion,
      sourceSystemId: header.sourceSystemId,
      label: `SIC ${header.snapshotDate.toISOString().slice(0, 10)}`,
      sourceArchiveHash,
      sourceArchivePath: archivePath,
      isActive: true,
    },
  });
  console.log(`[brownfield-sic] Created BrownfieldCatalogVersion ${catalog.id}`);

  // Insert application areas (small, do single createMany)
  if (areas.length > 0) {
    await prisma.brownfieldApplicationArea.createMany({
      data: areas.map((a) => ({
        catalogVersionId: catalog.id,
        areaKey: a.areaKey,
        areaName: a.areaName,
      })),
      skipDuplicates: true,
    });
    console.log(`[brownfield-sic] Inserted ${areas.length} application areas`);
  }

  // Insert LOBs
  if (lobs.length > 0) {
    await prisma.brownfieldLineOfBusiness.createMany({
      data: lobs.map((l) => ({
        catalogVersionId: catalog.id,
        sapId: l.sapId,
        name: l.name,
        type: l.type,
        owningContextId: l.owningContextId,
        parentSapId: l.parentSapId,
        status: l.status,
        lifecycleStatus: l.lifecycleStatus,
        rank: l.rank,
      })),
      skipDuplicates: true,
    });
    console.log(`[brownfield-sic] Inserted ${lobs.length} LOBs`);
  }

  // Insert simplification items (chunk to avoid query size limits)
  const chunkSize = 200;
  for (let i = 0; i < sitems.length; i += chunkSize) {
    const slice = sitems.slice(i, i + chunkSize);
    await prisma.simplificationItem.createMany({
      data: slice.map((s) => ({
        catalogVersionId: catalog.id,
        sapGuid: s.sapGuid,
        sitemId: s.sitemId,
        titleEn: s.titleEn,
        applicationArea: s.applicationArea,
        procStatus: s.procStatus,
        procStatusTextEn: s.procStatusTextEn,
        checkCondition: s.checkCondition,
        impactNote: s.impactNote,
        businessAreaGuid: s.businessAreaGuid,
        lobTechnologyGuid: s.lobTechnologyGuid,
        startRelValidFromPrdVer: s.startRelValidFromPrdVer,
        startRelValidFromStack: s.startRelValidFromStack,
        startRelValidToPrdVer: s.startRelValidToPrdVer,
        startRelValidToStack: s.startRelValidToStack,
        referGuid: s.referGuid,
        copyGuid: s.copyGuid,
        copyStatus: s.copyStatus,
        createdBySap: s.createdBySap,
        changedBySap: s.changedBySap,
      })),
      skipDuplicates: true,
    });
  }
  console.log(`[brownfield-sic] Inserted ${sitems.length} SimplificationItems`);

  // Build sapGuid → simplificationItem.id map for FK resolution
  const sitemRows = await prisma.simplificationItem.findMany({
    where: { catalogVersionId: catalog.id },
    select: { id: true, sapGuid: true },
  });
  const guidToItemId = new Map<string, string>();
  for (const r of sitemRows) guidToItemId.set(r.sapGuid, r.id);

  // Insert checks (FK-resolved)
  let resolvedChecks = 0;
  let orphanChecks = 0;
  for (let i = 0; i < checks.length; i += chunkSize) {
    const slice = checks.slice(i, i + chunkSize);
    await prisma.simplificationItemCheck.createMany({
      data: slice.map((c) => {
        const itemId = guidToItemId.get(c.sitemGuid);
        if (itemId) resolvedChecks++; else orphanChecks++;
        return {
          catalogVersionId: catalog.id,
          simplificationItemId: itemId ?? null,
          sitemGuid: c.sitemGuid,
          checkGuid: c.checkGuid,
          checkType: c.checkType,
          checkIdentifier: c.checkIdentifier,
          checkSubIdentifier: c.checkSubIdentifier,
          sapNote: c.sapNote,
          checkCountOption: c.checkCountOption,
          checkCount: c.checkCount,
          checkClassUsage: c.checkClassUsage,
          bfChkState: c.bfChkState,
          checkCondition: c.checkCondition,
        };
      }),
      skipDuplicates: true,
    });
  }
  console.log(
    `[brownfield-sic] Inserted ${checks.length} SimplificationItemChecks (${resolvedChecks} FK-resolved, ${orphanChecks} orphan)`,
  );

  // Insert related notes (deduped by noteGuid, FK-resolved best-effort)
  let resolvedNotes = 0;
  let orphanNotes = 0;
  const noteByGuid = new Map<string, NoteRow>();
  for (const n of notes) noteByGuid.set(n.noteGuid, n);
  const dedupedNotes = Array.from(noteByGuid.values());
  for (let i = 0; i < dedupedNotes.length; i += chunkSize) {
    const slice = dedupedNotes.slice(i, i + chunkSize);
    await prisma.relatedSapNote.createMany({
      data: slice.map((n) => {
        const itemId = n.sitemGuid ? guidToItemId.get(n.sitemGuid) : null;
        if (itemId) resolvedNotes++; else orphanNotes++;
        return {
          catalogVersionId: catalog.id,
          simplificationItemId: itemId ?? null,
          sitemGuid: n.sitemGuid,
          noteGuid: n.noteGuid,
          noteType: n.noteType,
          noteTypeTextEn: n.noteTypeTextEn,
          sapNote: n.sapNote,
        };
      }),
      skipDuplicates: true,
    });
  }
  console.log(
    `[brownfield-sic] Inserted ${dedupedNotes.length} RelatedSapNotes (${resolvedNotes} FK-resolved, ${orphanNotes} catalog-wide)`,
  );

  console.log(`[brownfield-sic] Done. Catalog id: ${catalog.id}`);
}

if (process.argv[1] && process.argv[1].endsWith("brownfield-sic-adapter.ts")) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: tsx scripts/ingest/brownfield-sic-adapter.ts <path-to-zip>");
    process.exit(1);
  }
  runBrownfieldSicIngest(arg)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error("[brownfield-sic] Failed:", err);
      void prisma.$disconnect();
      process.exit(1);
    });
}
