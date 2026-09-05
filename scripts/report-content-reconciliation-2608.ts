/**
 * 2608 WS5 — the Content Reconciliation report, generated.
 *
 *   pnpm sap:2608:reconciliation   → docs/2608/content-reconciliation-2608.md
 *
 * The 2602 programme kept a "Content Reconciliation" workbook by hand (its D1
 * tab drove the WS1 SSCUI-citation re-validation). The workbook itself is not
 * in this repository, so this report REPRODUCES its first three subjects from
 * the committed 2608 drop and the code that consumes it, and is regenerated
 * whenever either changes:
 *
 *   Tab 1 — BPD test scripts: 2602 → 2608 steps per workbench item
 *   Tab 2 — BDC questionnaires: what SAP re-issued, and what the affirm set does with it
 *   Tab 3 — Fit-to-Standard data files: provenance, release stamp, D1 grounding
 *
 * Every number is computed at generation time; nothing is typed in.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ExcelJS from "exceljs";

import BASELINE_2602 from "./lib/bpd-2608/baseline-2602.json";
import { composeBpd } from "./lib/bpd-2608/compose";
import { parseBpdDocx } from "./lib/bpd-2608/parse-bpd-docx";
import { parseBpdXlsx } from "./lib/bpd-2608/parse-bpd-xlsx";
import { loadManifest } from "./lib/manifest-2608";
import { BPD_2608_SCOPE_ITEMS, sapContentSourcesFor } from "./lib/sap-content-sources";
import { cellText } from "./lib/sap-2608/xlsx";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs/2608/content-reconciliation-2608.md");
const ASSESSMENT = path.join(ROOT, "docs/2608/aptus-SAP-Inventory-Currency-Assessment-2026-09-05.xlsx");
const SIDECAR = path.join(ROOT, "sap-references/2608/bdc-questionnaires.json");
const DELTA_2608 = path.join(ROOT, "prisma/seeds/value-stream/dataset-2608.json");
const BASE_DATASET = path.join(ROOT, "prisma/seeds/value-stream/dataset.json");

type Baseline = {
  title: string;
  steps: string[];
  roles: string[];
  apps: string[];
  decisions: number;
  sscuiRefs: number;
};
type Sidecar = {
  questionnaires: {
    id: string;
    name: string;
    file: string;
    sheet: string;
    sha256: string | null;
    changedAt2608: boolean;
    newAt2608: boolean;
    counts: { questions: number; byLevel: Record<string, number>; withSscui: number };
  }[];
  _provenance: { notInDrop: string[]; inDropNotBdc: string[] };
};
type Delta2608 = {
  meta: { counts: Record<string, number> };
  questions: unknown[];
  relevel: { id: string; bdcLevel: string; sourceQuestionnaire: string }[];
};
type FtsItem = {
  code: string;
  title: string;
  release: string;
  process_steps: unknown[];
  business_roles: unknown[];
  fiori_apps: unknown[];
  decisions: { sscui_id?: string }[];
  sscui_refs: unknown[];
  value_stream?: boolean;
};

async function assessmentByteCompare(): Promise<Map<string, { result: string; detail: string }>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ASSESSMENT);
  const ws = wb.getWorksheet("BDC & BPD Delta");
  const out = new Map<string, { result: string; detail: string }>();
  ws?.eachRow((row, n) => {
    if (n < 4) return;
    const id = cellText(row.getCell(1).value);
    if (id) out.set(id, { result: cellText(row.getCell(4).value), detail: cellText(row.getCell(5).value) });
  });
  return out;
}

function stepKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(optional\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function main(): Promise<void> {
  const sources = sapContentSourcesFor("2608");
  const manifest = loadManifest(sources.manifest!);
  const sha = (rel: string) => manifest.files.find((f) => f.file === rel)?.sha256 ?? "";
  const byteCompare = await assessmentByteCompare();
  const generatedAt = new Date().toISOString().slice(0, 10);
  const L: string[] = [];

  L.push("# Content Reconciliation — SAP content release 2608");
  L.push("");
  L.push(
    `Generated ${generatedAt} by \`scripts/report-content-reconciliation-2608.ts\` (\`pnpm sap:2608:reconciliation\`). Every figure below is computed from the committed drop (\`sap-references/2608/\`, sha256-pinned by its MANIFEST) and the code that consumes it. The 2602 programme's hand-kept "Content Reconciliation" workbook is not in the repository; this report reproduces the subjects of its tabs 1–3 from primary sources and states where it cannot.`,
  );
  L.push("");

  // ── Tab 1 — BPD steps ────────────────────────────────────────────────────
  L.push("## Tab 1 — BPD test scripts: 2602 → 2608 steps per workbench item");
  L.push("");
  L.push(
    "Source of the 2608 column: the structured test case (`<CODE>_S4CLD2608_BPD_EN_MY.xlsx`) — one step per activity after the `Test Procedures` marker; roles from the docx Roles table. Source of the 2602 column: the three data files the 2602 workbench carried, frozen in `scripts/lib/bpd-2608/baseline-2602.json`. *none* = the item had no exact steps in aptus before 2608.",
  );
  L.push("");
  L.push(
    "| Code | Title | 2602 steps | 2608 steps | Added | Removed | Roles 2608 | Apps 2608 | xlsx sha256 | Assessment byte-compare (docx) |",
  );
  L.push("|---|---|---:|---:|---:|---:|---:|---:|---|---|");
  for (const code of BPD_2608_SCOPE_ITEMS) {
    const src = sources.bpd.find((b) => b.scopeItemCode === code)!;
    const x = await parseBpdXlsx(src.xlsx, code);
    const d = parseBpdDocx(src.docx, code);
    const c = composeBpd(x, d);
    const base = (BASELINE_2602 as Record<string, Baseline | unknown>)[code] as Baseline | undefined;
    const after = c.process_steps.map((s) => s.name);
    const b = new Set((base?.steps ?? []).map(stepKey));
    const a = new Set(after.map(stepKey));
    const added = base ? after.filter((s) => !b.has(stepKey(s))).length : after.length;
    const removed = base ? base.steps.filter((s) => !a.has(stepKey(s))).length : 0;
    const bc = byteCompare.get(code);
    L.push(
      `| ${code} | ${c.title} | ${base ? base.steps.length : "none"} | ${after.length} | ${added} | ${removed} | ${c.business_roles.length} | ${c.fiori_apps.length} | \`${sha(src.xlsx).slice(0, 12)}\` | ${bc ? `${bc.result} — ${bc.detail}` : "—"} |`,
    );
  }
  L.push("");
  L.push("Detail per item (added/removed step names): `docs/2608/bpd-delta.md`.");
  L.push("");

  // ── Tab 2 — BDC ──────────────────────────────────────────────────────────
  L.push("## Tab 2 — BDC questionnaires: what SAP re-issued at 2608, and what the affirm set does with it");
  L.push("");
  const sidecar = JSON.parse(fs.readFileSync(SIDECAR, "utf8")) as Sidecar;
  const delta = JSON.parse(fs.readFileSync(DELTA_2608, "utf8")) as Delta2608;
  const baseQ = (
    JSON.parse(fs.readFileSync(BASE_DATASET, "utf8")) as {
      questions: { id: string; sourceQuestionnaire: string | null }[];
    }
  ).questions;
  const baseBySource = new Map<string, number>();
  for (const q of baseQ) {
    const id = (q.sourceQuestionnaire ?? "").split(/\s+/)[0] ?? "";
    baseBySource.set(id, (baseBySource.get(id) ?? 0) + 1);
  }
  L.push(
    'Source: the 14 workbooks in the drop, parsed by `scripts/lib/bdc-2608/parse-bdc.ts` into `sap-references/2608/bdc-questionnaires.json`; the byte comparison is the assessment workbook\'s sheet "BDC & BPD Delta" (2602 re-download vs 2608). "Affirm rows (2602)" = questions in `prisma/seeds/value-stream/dataset.json` sourced from that questionnaire.',
  );
  L.push("");
  L.push(
    "| ID | Name | 2608 sheet | Questions | L1 / L2 / L3 / none | With SSCUI id | Byte-compare 2602→2608 | Affirm rows (2602) | Action at 2608 |",
  );
  L.push("|---|---|---|---:|---|---:|---|---:|---|");
  for (const q of sidecar.questionnaires) {
    const lv = `${q.counts.byLevel.L1 ?? 0} / ${q.counts.byLevel.L2 ?? 0} / ${q.counts.byLevel.L3 ?? 0} / ${q.counts.byLevel.none ?? 0}`;
    const bc = byteCompare.get(q.id);
    const rows = baseBySource.get(q.id) ?? 0;
    const relevelled = delta.relevel.filter((r) => r.sourceQuestionnaire.startsWith(q.id)).length;
    const action = q.newAt2608
      ? `NEW — loaded as value stream "process-automation" (${delta.meta.counts.newQuestions} questions, releaseId 2608, no SAP Level)`
      : q.changedAt2608
        ? rows > 0
          ? `CHANGED — ${relevelled} of ${rows} affirm rows re-levelled from the 2608 sheet by verbatim match`
          : "CHANGED — no 2602 affirm rows from this questionnaire, nothing to re-level"
        : "identical — affirm rows untouched";
    L.push(
      `| ${q.id} | ${q.name} | ${q.sheet} | ${q.counts.questions} | ${lv} | ${q.counts.withSscui} | ${bc ? bc.result : "—"} | ${rows} | ${action} |`,
    );
  }
  L.push("");
  L.push(
    `Not in the drop (listed by the assessment, not shipped in the 2608 folder): ${sidecar._provenance.notInDrop.join("; ")}. Their 2602 affirm rows (${sidecar._provenance.notInDrop
      .map((n) => n.split(" ")[0])
      .map((id) => baseBySource.get(id!) ?? 0)
      .join(
        " / ",
      )}) are untouched. In the drop but not a BDC questionnaire (no Question/Level rows, not parsed): ${sidecar._provenance.inDropNotBdc.join("; ") || "—"}.`,
  );
  L.push("");
  L.push(
    `Re-level result: ${delta.meta.counts.relevelled} matched, ${delta.meta.counts.relevelUnmatched} unmatched (a 2602 verbatim with no identical 2608 row keeps \`bdcLevel\` NULL — never guessed).`,
  );
  L.push("");

  // ── Tab 3 — FTS data provenance ──────────────────────────────────────────
  L.push("## Tab 3 — Fit-to-Standard data files: provenance and D1 grounding");
  L.push("");
  L.push(
    "Source: `src/lib/fts/data/index.ts` as built. D1 = every decision's `sscui_id` is empty or a numeric SSCUI id (the guard in `tests/unit/fts/decision-sscui.test.ts`).",
  );
  L.push("");
  L.push("| Code | Title | Release stamp | Steps | Roles | Apps | Decisions | SSCUI refs (file) | D1 | Source |");
  L.push("|---|---|---|---:|---:|---:|---:|---:|---|---|");
  const idx = (await import(pathToFileURL(path.join(ROOT, "src/lib/fts/data/index.ts")).href)) as {
    scopeItems: Record<string, FtsItem>;
  };
  for (const code of Object.keys(idx.scopeItems).sort()) {
    const it = idx.scopeItems[code]!;
    const d1 = it.decisions.every((d) => !d.sscui_id || /^\d+$/.test(d.sscui_id)) ? "ok" : "FAIL";
    const src = it.value_stream
      ? "src/lib/fts/value-streams (BDC S4H_433)"
      : `bpd-fts/${code}_S4CLD2608_BPD_EN_MY.xlsx \`${sha(`sap-references/2608/bpd-fts/${code}_S4CLD2608_BPD_EN_MY.xlsx`).slice(0, 12)}\``;
    L.push(
      `| ${code} | ${it.title} | ${it.release} | ${it.process_steps.length} | ${it.business_roles.length} | ${it.fiori_apps.length} | ${it.decisions.length} | ${it.sscui_refs.length} | ${d1} | ${src} |`,
    );
  }
  L.push("");
  L.push("## Not reconciled here");
  L.push("");
  L.push(
    "- The 2602 BPD files themselves (only their parsed data files were in the repository), so the 2602 column of Tab 1 is the workbench's prior content, not a 2602 re-parse.",
  );
  L.push(
    "- The two questionnaires the assessment lists but the drop does not contain (Quality Management, Public Sector), and the Two-Tier scope questionnaire (in the drop, not a BDC instrument).",
  );
  L.push(
    "- Process-Steps / SSCUI / scope-item deltas — those are WS1's RECON (`pnpm sap:2608:recon`) and `docs/2608/sscui-citation-revalidation.md`.",
  );
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, L.join("\n") + "\n", "utf8");
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
