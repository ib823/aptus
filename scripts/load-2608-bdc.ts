/**
 * 2608 WS5 — BDC questionnaires at release 2608.
 *
 *   pnpm sap:2608:load-bdc            # parse the 14 workbooks → sidecar + seed delta (no DB)
 *   pnpm sap:2608:load-bdc -- --db    # …then run the 2608 affirm seeder against DATABASE_URL
 *   pnpm sap:2608:load-bdc -- --check # parse + compare with the committed outputs, write nothing
 *
 * Writes
 *   sap-references/2608/bdc-questionnaires.json      every question of every 2608 workbook, normalised
 *   prisma/seeds/value-stream/dataset-2608.json      the additive seed delta (see prisma/seeds/value-stream/dataset-2608.ts)
 *
 * Rules (CCC PR / master prompt WS5.2):
 *   - S4H_706 Process Automation is NEW in the 2608 set → a new value stream
 *     "process-automation" with its questions, releaseId 2608. SAP's sheet has
 *     no Level for them → bdcLevel null, format "information" (they are
 *     discovery questions: "What business processes have you tried to automate?").
 *   - S4H_420 (Sourcing & Procurement) and S4H_1767 (Retail) CHANGED between
 *     2602 and 2608 → the existing affirm questions sourced from them are
 *     re-levelled from the 2608 sheet by exact verbatim match. The 2602
 *     affirm set carries 14 S4H_420 questions and NO S4H_1767 questions, so the
 *     Retail re-level is an empty set by construction — reported, not hidden.
 *   - The other 13 workbooks are byte-identical to 2602 (assessment sheet
 *     "BDC & BPD Delta"); their affirm rows are left exactly as they are.
 */
import fs from "node:fs";
import path from "node:path";

import { parseBdcWorkbook, questionKey, type BdcQuestionnaire } from "./lib/bdc-2608/parse-bdc";
import { manifestSha256, loadManifest } from "./lib/manifest-2608";
import { BDC_2608, sapContentSourcesFor } from "./lib/sap-content-sources";
import type { Dataset2608 } from "../prisma/seeds/value-stream/dataset-2608";

const ROOT = process.cwd();
const SIDECAR = path.join(ROOT, "sap-references/2608/bdc-questionnaires.json");
const DELTA = path.join(ROOT, "prisma/seeds/value-stream/dataset-2608.json");
const BASE = path.join(ROOT, "prisma/seeds/value-stream/dataset.json");

/** Workbooks SAP re-issued at 2608 (assessment sheet "BDC & BPD Delta"); the others are byte-identical to 2602. */
export const CHANGED_AT_2608 = ["S4H_420", "S4H_1767"] as const;
export const NEW_AT_2608 = ["S4H_706"] as const;

type BaseQuestion = { id: string; sapVerbatim: string | null; sourceQuestionnaire: string | null };

function nameOf(file: string): string {
  return file.replace(/^S4H_\d+ BDC Questionnaire - /, "").replace(/\.xlsx$/, "");
}

export function buildDelta(parsed: BdcQuestionnaire[], base: BaseQuestion[], generatedAt: string): Dataset2608 {
  const pa = parsed.find((p) => p.id === "S4H_706");
  if (!pa) throw new Error("S4H_706 not parsed");
  const streamId = "process-automation";
  const subProcessId = `${streamId}::sap-build-process-automation`;
  const questions: Dataset2608["questions"] = pa.questions.map((q, i) => ({
    id: `L2-706-${String(i + 1).padStart(3, "0")}`,
    streamId,
    subProcessId,
    scopeItemRefs: q.scopeRefs,
    sapVerbatim: q.question,
    sapArea: q.process || "SAP Build Process Automation",
    sapTopic: q.topicDefinition || null,
    sscuiRef: /^\d{5,6}$/.test(q.sapId) ? q.sapId : "N/A",
    sourceQuestionnaire: "S4H_706  (Process Automation)",
    placementBasis: "Questionnaire LoB (new in 2608)",
    status: "suggested",
    flag: null,
    statusNote: `New in the 2608 accelerator set (S4H_706, sheet "${pa.sheet}" row ${q.row}). SAP's sheet carries no Level — a discovery question, shown as information until a consultant curates it.`,
    displayOrder: i + 1,
    format: "information",
    bdcLevel: q.level,
  }));

  const relevel: Dataset2608["relevel"] = [];
  let unmatched = 0;
  for (const id of CHANGED_AT_2608) {
    const sheet = parsed.find((p) => p.id === id);
    if (!sheet) continue;
    const byKey = new Map<string, { level: BdcQuestionnaire["questions"][number]["level"]; row: number }>();
    for (const q of sheet.questions)
      if (!byKey.has(questionKey(q.question))) byKey.set(questionKey(q.question), { level: q.level, row: q.row });
    for (const b of base) {
      if (!b.sourceQuestionnaire?.startsWith(id) || !b.sapVerbatim) continue;
      const hit = byKey.get(questionKey(b.sapVerbatim));
      if (hit?.level)
        relevel.push({
          id: b.id,
          bdcLevel: hit.level,
          sourceQuestionnaire: `${id}  (${sheet.name})`,
          matchedRow: hit.row,
        });
      else unmatched++;
    }
  }

  return {
    meta: {
      sapRelease: "S/4HANA Cloud Public Edition 2608",
      generatedAt,
      sources: parsed.map((p) => p.file),
      counts: {
        newStreams: 1,
        newSubProcesses: 1,
        newQuestions: questions.length,
        relevelled: relevel.length,
        relevelUnmatched: unmatched,
      },
    },
    valueStreams: [{ id: streamId, name: "Process Automation", isFoundation: false, displayOrder: 8 }],
    subProcesses: [
      { id: subProcessId, streamId, name: "SAP Build Process Automation", type: "functional", displayOrder: 0 },
    ],
    questions,
    relevel,
  };
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const db = process.argv.includes("--db");
  const sources = sapContentSourcesFor("2608");
  const manifest = loadManifest(sources.manifest!);
  const generatedAt = new Date().toISOString().slice(0, 10);

  const parsed: BdcQuestionnaire[] = [];
  const notBdc: string[] = [];
  for (const { id, file } of BDC_2608) {
    // The drop also carries the Two-Tier SCOPE questionnaire (S4H_1613) — a
    // different instrument with no Question/Level rows. Listed, not parsed.
    if (!/BDC Questionnaire/.test(file)) {
      notBdc.push(`${id} (${path.basename(file)})`);
      continue;
    }
    const rel = file.startsWith("sap-references/") ? file : `${sources.dropDir}/${file}`;
    const q = await parseBdcWorkbook(rel, id, nameOf(path.basename(file)));
    parsed.push(q);
  }
  const sidecar = {
    _provenance: {
      purpose:
        "Every question of every SAP BDC questionnaire shipped in the 2608 accelerator set, normalised across SAP's five sheet layouts. Generated — do not edit.",
      generatedBy: "scripts/load-2608-bdc.ts",
      generatedAt,
      manifest: sources.manifest,
      manifestSha256: manifestSha256(sources.manifest!),
      changedAt2608: CHANGED_AT_2608,
      newAt2608: NEW_AT_2608,
      notInDrop: ["S4H_2236 (Quality Management)", "S4H_2132 (Public Sector)"],
      inDropNotBdc: notBdc,
    },
    questionnaires: parsed.map((p) => ({
      ...p,
      sha256: manifest.files.find((f) => f.file === p.file)?.sha256 ?? null,
      changedAt2608: (CHANGED_AT_2608 as readonly string[]).includes(p.id),
      newAt2608: (NEW_AT_2608 as readonly string[]).includes(p.id),
    })),
  };
  const base = (JSON.parse(fs.readFileSync(BASE, "utf8")) as { questions: BaseQuestion[] }).questions;
  const delta = buildDelta(parsed, base, generatedAt);

  const outputs: [string, string][] = [
    [SIDECAR, JSON.stringify(sidecar, null, 2) + "\n"],
    [DELTA, JSON.stringify(delta, null, 2) + "\n"],
  ];
  const strip = (s: string) => s.replace(/"generatedAt": "[^"]*"/g, "");
  if (check) {
    let drift = 0;
    for (const [file, content] of outputs) {
      const cur = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (strip(cur) !== strip(content)) {
        drift++;
        console.log(`DRIFT  ${path.relative(ROOT, file)}`);
      }
    }
    console.log(drift ? `FAIL: ${drift} file(s) differ` : "OK: BDC sidecar + seed delta match the 2608 drop");
    process.exit(drift ? 1 : 0);
  }
  for (const [file, content] of outputs) fs.writeFileSync(file, content, "utf8");

  for (const p of parsed) {
    const lv = Object.entries(p.counts.byLevel)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    console.log(
      `${p.id.padEnd(9)} ${p.name.padEnd(26)} sheet "${p.sheet}" hdr ${p.headerRow}  questions ${String(p.counts.questions).padStart(3)}  levels ${lv}  sscui ${p.counts.withSscui}  scope refs ${p.counts.scopeRefs}`,
    );
  }
  console.log(`\nS4H_706 → stream "process-automation": ${delta.questions.length} questions (releaseId 2608)`);
  console.log(
    `re-level from 2608 sheets: ${delta.relevel.length} matched, ${delta.meta.counts.relevelUnmatched} unmatched (S4H_420 base rows ${base.filter((b) => b.sourceQuestionnaire?.startsWith("S4H_420")).length}, S4H_1767 base rows ${base.filter((b) => b.sourceQuestionnaire?.startsWith("S4H_1767")).length})`,
  );
  console.log(`wrote ${path.relative(ROOT, SIDECAR)} and ${path.relative(ROOT, DELTA)}`);

  if (db) {
    const { PrismaClient } = await import("@prisma/client");
    const { seedValueStream2608 } = await import("../prisma/seeds/value-stream/dataset-2608");
    const prisma = new PrismaClient();
    try {
      const r = await seedValueStream2608(prisma);
      console.log(
        `db: release ${r.release} — streams ${r.streams}, sub-processes ${r.subProcesses}, questions ${r.questions}, re-levelled ${r.relevelled} (skipped ${r.relevelSkipped}: not in this database)`,
      );
    } finally {
      await prisma.$disconnect();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
