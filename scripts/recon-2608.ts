/**
 * RECON — SAP S/4HANA Cloud 2608 content drop (WS0, docs/2608/BUILD-LOG.md).
 *
 * Proves two things about `sap-references/2608/` and prints a RECON report:
 *
 *   1. INTEGRITY — every file in MANIFEST.json is present with the recorded
 *      sha256 + bytes, nothing unlisted is in the drop, no zips; and each
 *      workbook's structural row count matches the manifest's `rows`.
 *   2. FACTS — the counts the master prompt encodes (verified 2026-09-05) are
 *      what the landed files actually say: 679 scope items (+13 new present,
 *      6 obsolete absent), 4,328 SSCUI activity IDs, 19,158 process-step rows
 *      over 661 items, 16 BDC questionnaires + S4H_1613, 9 BPD docx+xlsx pairs.
 *      Numeric facts tolerate ±1% drift; presence facts do not.
 *
 * Usage:
 *   pnpm sap:2608:recon            report; exit 1 on any finding
 *   pnpm sap:2608:recon --write    also refresh MANIFEST.json rows/sheets and
 *                                  RELEASE.json (status, manifestHash, facts)
 *   pnpm sap:2608:recon --json     machine-readable report
 *   pnpm sap:2608:recon --skip-facts   integrity only (fast)
 *   pnpm sap:2608:recon --db           also reconcile what the WS1 loaders wrote (needs DATABASE_URL)
 *
 * Exit codes: 0 green · 1 findings · 2 manifest unreadable.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import ExcelJS from "exceljs";

import {
  fileRowCounts,
  loadManifest,
  manifestSha256,
  verifyManifest,
  writeManifest,
  type IntegrityResult,
  type Manifest,
} from "./lib/manifest-2608";
import { BPD_2608_SCOPE_ITEMS, sapContentSourcesFor, type SheetSource } from "./lib/sap-content-sources";

const RELEASE = "2608" as const;
const SOURCES = sapContentSourcesFor(RELEASE);
const DROP_DIR = SOURCES.dropDir!;
const MANIFEST_PATH = SOURCES.manifest!;
const RELEASE_JSON = `${DROP_DIR}/RELEASE.json`;
const TOLERANCE = 0.01; // ±1 % on numeric facts

/** Verified facts (master prompt + currency assessment, 2026-09-05). */
export const FACTS_2608 = {
  scopeItems: 679,
  scopeItemsNew: ["5RP", "7ED", "7Z1", "82X", "830", "839", "83B", "83D", "83I", "83S", "85O", "86C", "88K"],
  scopeItemsObsolete: ["1QR", "21T", "2RP", "3FY", "6VB", "7ZH"],
  sscuiActivityIds: 4328,
  processStepRows: 19158,
  processStepItems: 661,
  bdcQuestionnaires: 16, // S4H_* BDC files, excluding the Two-Tier scope questionnaire
  bdcNewIn2608: "S4H_706",
  bpdPairs: 9,
} as const;

type Observed = {
  scopeItems: number | null;
  scopeItemsNewPresent: string[];
  scopeItemsObsoletePresent: string[];
  retiredScopeItems: number | null;
  scopeItem1NN: { inScopeSheet: boolean; inProcessSteps: boolean } | null;
  sscuiActivityIds: number | null;
  sscuiRows: number | null;
  processStepRows: number | null;
  processStepItems: number | null;
  bdcQuestionnaires: number;
  bdcNewPresent: boolean;
  twoTierPresent: boolean;
  bpdPairs: number;
};

type ReleaseRecord = {
  release: string;
  releaseVersion: string;
  supersedes: string;
  localisation: string;
  status: "PENDING" | "LANDED";
  landedAt: string | null;
  source: { folder: string; packaging: string };
  manifest: { path: string; sha256: string | null; fileCount: number; totalBytes: number };
  recon: { script: string; lastRunAt: string | null; ok: boolean | null; facts: Observed | null };
};

type Report = {
  release: string;
  dropDir: string;
  manifest: { path: string; sha256: string; fileCount: number; totalBytes: number; generated: string };
  integrity: IntegrityResult;
  rowDrift: { file: string; manifest: number | null | undefined; onDisk: number | null }[];
  facts: { name: string; expected: number | string; observed: number | string | null; ok: boolean }[];
  observed: Observed | null;
  notes: string[];
  findings: string[];
  ok: boolean;
  wrote: boolean;
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const text = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text ?? "");
    if ("result" in v) return String(v.result ?? "");
    if (v instanceof Date) return v.toISOString();
    return "";
  }
  return String(v);
};

async function readSheet(src: SheetSource): Promise<{ ws: ExcelJS.Worksheet; col: (header: string) => number }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(process.cwd(), src.file));
  const ws = wb.getWorksheet(src.sheet);
  if (!ws) throw new Error(`${src.file}: worksheet "${src.sheet}" not found`);
  // values[] is sparse (holes for empty cells) — Array.from fills them so findIndex never sees undefined.
  const headers = Array.from(ws.getRow(src.headerRow).values as ExcelJS.CellValue[], (v) => text(v ?? null));
  const col = (header: string) => {
    const i = headers.findIndex((h) => h.trim() === header);
    if (i < 0) throw new Error(`${src.file}/${src.sheet}: column "${header}" not found`);
    return i; // values[] is 1-based with a leading undefined, so index == column number
  };
  return { ws, col };
}

function within(expected: number, observed: number | null): boolean {
  if (observed === null) return false;
  return Math.abs(observed - expected) <= Math.max(1, Math.round(expected * TOLERANCE));
}

// ---------------------------------------------------------------------------
// facts
// ---------------------------------------------------------------------------

async function observeFacts(manifest: Manifest): Promise<{ observed: Observed; notes: string[] }> {
  const notes: string[] = [];
  const listed = new Set(manifest.files.map((f) => f.file));

  // Scope items — Availability & Dependencies, sheet "Scope"
  const ad = await readSheet(SOURCES.scopeItems!);
  const idCol = ad.col("Scope Item ID");
  const scopeIds = new Set<string>();
  for (let r = SOURCES.scopeItems!.headerRow + 1; r <= ad.ws.rowCount; r++) {
    const id = text(ad.ws.getRow(r).getCell(idCol).value).trim();
    if (id) scopeIds.add(id);
  }
  const retired = await readSheet(SOURCES.retiredScopeItems!);
  let retiredCount = 0;
  for (let r = 2; r <= retired.ws.rowCount; r++) if (text(retired.ws.getRow(r).getCell(1).value).trim()) retiredCount++;

  // SSCUI — sheet "2608"
  const ss = await readSheet(SOURCES.sscui!);
  const actIdCol = ss.col("Configuration Activity ID");
  const actCol = ss.col("Configuration Activity");
  const sscuiIds = new Set<string>();
  let sscuiRows = 0;
  for (let r = SOURCES.sscui!.headerRow + 1; r <= ss.ws.rowCount; r++) {
    const row = ss.ws.getRow(r);
    const id = text(row.getCell(actIdCol).value).trim();
    const act = text(row.getCell(actCol).value).trim();
    if (!id && !act) continue;
    sscuiRows++;
    if (id) sscuiIds.add(id);
  }

  // Process steps — sheet "Scope"
  const ps = await readSheet(SOURCES.processSteps!);
  const psIdCol = ps.col("Scope Item ID");
  const psItems = new Set<string>();
  let psRows = 0;
  for (let r = SOURCES.processSteps!.headerRow + 1; r <= ps.ws.rowCount; r++) {
    const id = text(ps.ws.getRow(r).getCell(psIdCol).value).trim();
    if (!id) continue;
    psRows++;
    psItems.add(id);
  }

  // BDC + BPD presence (from the manifest, which integrity already verified)
  const bdcPresent = SOURCES.bdcQuestionnaires.filter((q) => listed.has(q.file));
  const bdcCount = bdcPresent.filter((q) => q.id !== "S4H_1613").length;
  const twoTierPresent = bdcPresent.some((q) => q.id === "S4H_1613");
  const bdcNewPresent = bdcPresent.some((q) => q.id === FACTS_2608.bdcNewIn2608);
  const bpdPairs = SOURCES.bpd.filter((b) => listed.has(b.docx) && listed.has(b.xlsx)).length;

  const in1NN = { inScopeSheet: scopeIds.has("1NN"), inProcessSteps: psItems.has("1NN") };
  if (in1NN.inScopeSheet && in1NN.inProcessSteps) {
    notes.push(
      "1NN is present in BOTH the A&D Scope sheet and Process-Steps — the assessment's '1NN not in A&D' anomaly does not reproduce from these files",
    );
  }
  const psNotInAd = [...psItems].filter((id) => !scopeIds.has(id));
  const adNotInPs = [...scopeIds].filter((id) => !psItems.has(id));
  notes.push(
    `Process-Steps items not in A&D: ${psNotInAd.length}${psNotInAd.length ? ` (${psNotInAd.slice(0, 10).join(", ")}${psNotInAd.length > 10 ? ", …" : ""})` : ""}`,
  );
  notes.push(`A&D items without Process-Steps rows: ${adNotInPs.length}`);
  notes.push(`A&D "Retired Scope Items" sheet: ${retiredCount} entries (informational — not a prompt fact)`);

  return {
    observed: {
      scopeItems: scopeIds.size,
      scopeItemsNewPresent: FACTS_2608.scopeItemsNew.filter((c) => scopeIds.has(c)),
      scopeItemsObsoletePresent: FACTS_2608.scopeItemsObsolete.filter((c) => scopeIds.has(c)),
      retiredScopeItems: retiredCount,
      scopeItem1NN: in1NN,
      sscuiActivityIds: sscuiIds.size,
      sscuiRows,
      processStepRows: psRows,
      processStepItems: psItems.size,
      bdcQuestionnaires: bdcCount,
      bdcNewPresent,
      twoTierPresent,
      bpdPairs,
    },
    notes,
  };
}

function checkFacts(o: Observed): Report["facts"] {
  return [
    {
      name: "scope items (A&D distinct IDs)",
      expected: FACTS_2608.scopeItems,
      observed: o.scopeItems,
      ok: within(FACTS_2608.scopeItems, o.scopeItems),
    },
    {
      name: "new-in-2608 scope items present",
      expected: `${FACTS_2608.scopeItemsNew.length}/${FACTS_2608.scopeItemsNew.length}`,
      observed: `${o.scopeItemsNewPresent.length}/${FACTS_2608.scopeItemsNew.length}`,
      ok: o.scopeItemsNewPresent.length === FACTS_2608.scopeItemsNew.length,
    },
    {
      name: "obsolete scope items absent",
      expected: "0 present",
      observed: `${o.scopeItemsObsoletePresent.length} present${o.scopeItemsObsoletePresent.length ? ` (${o.scopeItemsObsoletePresent.join(", ")})` : ""}`,
      ok: o.scopeItemsObsoletePresent.length === 0,
    },
    {
      name: "SSCUI activity IDs (sheet 2608)",
      expected: FACTS_2608.sscuiActivityIds,
      observed: o.sscuiActivityIds,
      ok: within(FACTS_2608.sscuiActivityIds, o.sscuiActivityIds),
    },
    {
      name: "process-step rows",
      expected: FACTS_2608.processStepRows,
      observed: o.processStepRows,
      ok: within(FACTS_2608.processStepRows, o.processStepRows),
    },
    {
      name: "process-step scope items",
      expected: FACTS_2608.processStepItems,
      observed: o.processStepItems,
      ok: within(FACTS_2608.processStepItems, o.processStepItems),
    },
    {
      name: "BDC questionnaires (S4H_*, excl. Two-Tier)",
      expected: FACTS_2608.bdcQuestionnaires,
      observed: o.bdcQuestionnaires,
      ok: o.bdcQuestionnaires === FACTS_2608.bdcQuestionnaires,
    },
    {
      name: `new BDC ${FACTS_2608.bdcNewIn2608} present`,
      expected: "yes",
      observed: o.bdcNewPresent ? "yes" : "no",
      ok: o.bdcNewPresent,
    },
    {
      name: "S4H_1613 Two-Tier questionnaire present",
      expected: "yes",
      observed: o.twoTierPresent ? "yes" : "no",
      ok: o.twoTierPresent,
    },
    {
      name: `BPD docx+xlsx pairs (${BPD_2608_SCOPE_ITEMS.join(" ")})`,
      expected: FACTS_2608.bpdPairs,
      observed: o.bpdPairs,
      ok: o.bpdPairs === FACTS_2608.bpdPairs,
    },
  ];
}

// ---------------------------------------------------------------------------
// database (WS1 loaders) — only with --db
// ---------------------------------------------------------------------------

/** What the WS1 loaders must have produced for release 2608. */
export const DB_FACTS_2608 = {
  scopeItemsActiveOrPlanned: 679, // A&D Scope sheet
  deprecationPlanned: 9,
  obsolete: 6,
  retired: 137, // 143 on the Retired sheet minus the 6 obsolete
  anomaly: 0,
  configActivities: 4328,
  processStepRows: 19158,
  processStepItems: 661,
} as const;

async function observeDb(): Promise<{ facts: Report["facts"]; notes: string[] }> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const release = await prisma.sapContentRelease.findUnique({
      where: { release_localisation: { release: RELEASE, localisation: "MY" } },
    });
    if (!release)
      return {
        facts: [{ name: "SapContentRelease 2608 · MY row", expected: "present", observed: "missing", ok: false }],
        notes: [],
      };
    const catalog = await prisma.scopeCatalogVersion.findUnique({
      where: { version_edition: { version: RELEASE, edition: "PUBLIC" } },
    });
    const by = new Map<string, number>();
    if (catalog) {
      for (const g of await prisma.scopeItem.groupBy({
        by: ["lifecycleStatus"],
        where: { catalogVersionId: catalog.id },
        _count: { _all: true },
      }))
        by.set(g.lifecycleStatus, g._count._all);
    }
    const cfg = await prisma.configActivity.count({ where: { releaseId: release.id } });
    const psRows = await prisma.sapProcessStep.count({ where: { releaseId: release.id } });
    const psItems = (await prisma.sapProcessStep.groupBy({ by: ["scopeItemCode"], where: { releaseId: release.id } }))
      .length;
    const untouched = {
      scope: await prisma.scopeItem.count({ where: { releaseId: null } }),
      cfg: await prisma.configActivity.count({ where: { releaseId: null } }),
      affirmSteps: await prisma.affirmProcessStep.count(),
    };
    const n = (k: string) => by.get(k) ?? 0;
    const facts: Report["facts"] = [
      {
        name: "db · ScopeCatalogVersion PUBLIC/2608",
        expected: "present, inactive",
        observed: catalog ? `present, ${catalog.isActive ? "ACTIVE" : "inactive"}` : "missing",
        ok: !!catalog && !catalog.isActive,
      },
      {
        name: "db · scope items ACTIVE + DEPRECATION_PLANNED",
        expected: DB_FACTS_2608.scopeItemsActiveOrPlanned,
        observed: n("ACTIVE") + n("DEPRECATION_PLANNED"),
        ok: within(DB_FACTS_2608.scopeItemsActiveOrPlanned, n("ACTIVE") + n("DEPRECATION_PLANNED")),
      },
      {
        name: "db · DEPRECATION_PLANNED",
        expected: DB_FACTS_2608.deprecationPlanned,
        observed: n("DEPRECATION_PLANNED"),
        ok: n("DEPRECATION_PLANNED") === DB_FACTS_2608.deprecationPlanned,
      },
      {
        name: "db · OBSOLETE",
        expected: DB_FACTS_2608.obsolete,
        observed: n("OBSOLETE"),
        ok: n("OBSOLETE") === DB_FACTS_2608.obsolete,
      },
      {
        name: "db · RETIRED",
        expected: DB_FACTS_2608.retired,
        observed: n("RETIRED"),
        ok: within(DB_FACTS_2608.retired, n("RETIRED")),
      },
      {
        name: "db · ANOMALY",
        expected: DB_FACTS_2608.anomaly,
        observed: n("ANOMALY"),
        ok: n("ANOMALY") === DB_FACTS_2608.anomaly,
      },
      {
        name: "db · ConfigActivity (2608)",
        expected: DB_FACTS_2608.configActivities,
        observed: cfg,
        ok: within(DB_FACTS_2608.configActivities, cfg),
      },
      {
        name: "db · SapProcessStep rows (2608)",
        expected: DB_FACTS_2608.processStepRows,
        observed: psRows,
        ok: within(DB_FACTS_2608.processStepRows, psRows),
      },
      {
        name: "db · SapProcessStep scope items (2608)",
        expected: DB_FACTS_2608.processStepItems,
        observed: psItems,
        ok: within(DB_FACTS_2608.processStepItems, psItems),
      },
    ];
    const notes = [
      `db · 2602-era rows (releaseId null): ScopeItem ${untouched.scope} · ConfigActivity ${untouched.cfg} · AffirmProcessStep (MY flows) ${untouched.affirmSteps} — the WS1 loaders never write these`,
    ];
    return { facts, notes };
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// release record
// ---------------------------------------------------------------------------

function loadReleaseRecord(): ReleaseRecord {
  const abs = path.resolve(process.cwd(), RELEASE_JSON);
  const base: ReleaseRecord = {
    release: RELEASE,
    releaseVersion: `${RELEASE}.0`,
    supersedes: "2602",
    localisation: "MY",
    status: "PENDING",
    landedAt: null,
    source: { folder: "AB Workbench\\2608\\", packaging: "unpacked — zips are refused by recon and ignored by git" },
    manifest: { path: MANIFEST_PATH, sha256: null, fileCount: 0, totalBytes: 0 },
    recon: { script: "scripts/recon-2608.ts", lastRunAt: null, ok: null, facts: null },
  };
  if (!fs.existsSync(abs)) return base;
  const parsed = JSON.parse(fs.readFileSync(abs, "utf8")) as Partial<ReleaseRecord>;
  return {
    ...base,
    ...parsed,
    manifest: { ...base.manifest, ...(parsed.manifest ?? {}) },
    recon: { ...base.recon, ...(parsed.recon ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2));
  const write = args.has("--write");
  const json = args.has("--json");
  const skipFacts = args.has("--skip-facts");
  const withDb = args.has("--db");
  const now = new Date().toISOString();

  let manifest: Manifest;
  try {
    manifest = loadManifest(MANIFEST_PATH);
    if (manifest.release !== RELEASE)
      throw new Error(`manifest names release ${manifest.release}, expected ${RELEASE}`);
  } catch (err) {
    console.error(`RECON 2608 — cannot read ${MANIFEST_PATH}: ${(err as Error).message}`);
    return 2;
  }

  const integrity = verifyManifest(manifest, DROP_DIR);
  const findings = [...integrity.findings];
  const notes: string[] = [];

  // Structural row counts vs manifest
  const rowDrift: Report["rowDrift"] = [];
  let manifestChanged = false;
  for (const f of manifest.files) {
    if (integrity.missing.includes(f.file)) continue;
    const { rows, sheets } = fileRowCounts(f.file);
    if (f.rows !== rows) {
      rowDrift.push({ file: f.file, manifest: f.rows, onDisk: rows });
      if (write) {
        f.rows = rows;
        if (sheets) f.sheets = sheets;
        else delete f.sheets;
        manifestChanged = true;
      }
    } else if (write && sheets && JSON.stringify(f.sheets ?? {}) !== JSON.stringify(sheets)) {
      f.sheets = sheets;
      manifestChanged = true;
    }
  }
  const unrecorded = rowDrift.filter((d) => d.manifest === undefined).length;
  const changed = rowDrift.length - unrecorded;
  if (changed > 0) findings.push(`${changed} workbook(s) whose row count differs from MANIFEST.json`);
  if (unrecorded > 0 && !write)
    findings.push(`${unrecorded} file(s) have no "rows" in MANIFEST.json — run with --write to record them`);

  if (write && manifestChanged) writeManifest(MANIFEST_PATH, manifest);
  const manifestHash = manifestSha256(MANIFEST_PATH);
  const totalBytes = manifest.files.reduce((n, f) => n + f.bytes, 0);

  // Facts
  let observed: Observed | null = null;
  let facts: Report["facts"] = [];
  if (!skipFacts && integrity.missing.length === 0) {
    const res = await observeFacts(manifest);
    observed = res.observed;
    notes.push(...res.notes);
    facts = checkFacts(observed);
    for (const f of facts)
      if (!f.ok) findings.push(`FACT DRIFT > ±1%: ${f.name} — expected ${f.expected}, observed ${String(f.observed)}`);
  } else if (!skipFacts) {
    findings.push("facts skipped: manifest files missing on disk");
  }
  if (withDb) {
    const db = await observeDb();
    facts = [...facts, ...db.facts];
    notes.push(...db.notes);
    for (const f of db.facts)
      if (!f.ok) findings.push(`DB DRIFT: ${f.name} — expected ${f.expected}, observed ${String(f.observed)}`);
  }

  // Release record
  const record = loadReleaseRecord();
  const ok = findings.length === 0;
  let wrote = false;
  if (write) {
    if (integrity.zips.length > 0) {
      findings.unshift("--write refused for RELEASE.json: remove zips from the drop first");
    } else {
      const next: ReleaseRecord = {
        ...record,
        status: integrity.ok && manifest.files.length > 0 ? "LANDED" : "PENDING",
        landedAt: integrity.ok && manifest.files.length > 0 ? (record.landedAt ?? now) : record.landedAt,
        manifest: { path: MANIFEST_PATH, sha256: manifestHash, fileCount: manifest.files.length, totalBytes },
        recon: { script: "scripts/recon-2608.ts", lastRunAt: now, ok, facts: observed },
      };
      fs.writeFileSync(path.resolve(process.cwd(), RELEASE_JSON), JSON.stringify(next, null, 2) + "\n");
      wrote = true;
    }
  } else {
    if (record.manifest.sha256 && record.manifest.sha256 !== manifestHash)
      findings.push("RELEASE.json manifest.sha256 is stale — run with --write");
    if (record.status !== "LANDED" && integrity.ok && manifest.files.length > 0)
      findings.push("RELEASE.json status is PENDING but the drop verifies — run with --write");
  }

  const report: Report = {
    release: RELEASE,
    dropDir: DROP_DIR,
    manifest: {
      path: MANIFEST_PATH,
      sha256: manifestHash,
      fileCount: manifest.files.length,
      totalBytes,
      generated: manifest.generated,
    },
    integrity,
    rowDrift,
    facts,
    observed,
    notes,
    findings,
    ok: findings.length === 0,
    wrote,
  };

  if (json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  return report.ok ? 0 : 1;
}

function printHuman(r: Report): void {
  const list = (label: string, items: string[]) => {
    if (!items.length) return;
    console.log(`    ${label} (${items.length}):`);
    for (const i of items.slice(0, 30)) console.log(`      - ${i}`);
    if (items.length > 30) console.log(`      … ${items.length - 30} more`);
  };
  console.log(`RECON 2608 — ${r.dropDir}/${r.wrote ? "  (MANIFEST rows + RELEASE.json written)" : ""}`);
  console.log(
    `  manifest:  ${r.manifest.path} · generated ${r.manifest.generated} · ${r.manifest.fileCount} files · ${r.manifest.totalBytes.toLocaleString("en-US")} bytes`,
  );
  console.log(`             sha256 ${r.manifest.sha256}`);
  console.log(
    `  integrity: ${r.integrity.verified}/${r.manifest.fileCount} files match sha256+bytes${r.integrity.ok ? " · no unlisted files · no zips" : ""}`,
  );
  list("missing", r.integrity.missing);
  list("mismatched", r.integrity.mismatched);
  list("unlisted", r.integrity.unlisted);
  list("zips", r.integrity.zips);
  const unrecorded = r.rowDrift.filter((d) => d.manifest === undefined).length;
  if (unrecorded) console.log(`    rows not yet recorded in MANIFEST.json: ${unrecorded} file(s)`);
  list(
    "row-count drift",
    r.rowDrift
      .filter((d) => d.manifest !== undefined)
      .map(
        (d) => `${d.file.replace(`${r.dropDir}/`, "")}: manifest ${String(d.manifest)} → on disk ${String(d.onDisk)}`,
      ),
  );
  if (r.facts.length) {
    console.log("  facts (±1% on counts):");
    const w = Math.max(...r.facts.map((f) => f.name.length));
    for (const f of r.facts)
      console.log(
        `    ${f.ok ? "OK  " : "FAIL"} ${f.name.padEnd(w)}  expected ${String(f.expected).padStart(6)}  observed ${String(f.observed)}`,
      );
  }
  if (r.notes.length) {
    console.log("  notes:");
    for (const n of r.notes) console.log(`    · ${n}`);
  }
  if (r.findings.length) {
    console.log("  findings:");
    for (const f of r.findings) console.log(`    ! ${f}`);
    console.log("  result:    DRIFT");
  } else {
    console.log("  result:    GREEN — drop matches MANIFEST.json and the 2608 facts");
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    console.error(err);
    process.exitCode = 1;
  },
);
