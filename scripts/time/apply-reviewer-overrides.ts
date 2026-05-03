/**
 * TIME RFT — apply ABeam reviewer overrides from the marked-up workbook.
 *
 * Reads TIME_Reviewer_Workbook_*.xlsx (latest by mtime, or --file <path>),
 * walks every per-module sheet + the Priority Review sheet, and for each
 * row whose Decision column is non-blank:
 *
 *   Approve — write a new ClassificationVerdict that mirrors the v2
 *             output but with actor=abeam-reviewer-approved + source=MANUAL.
 *             This clears the [REVIEW] flag because the next App 2 response
 *             generator suppresses flags for MANUAL-source verdicts.
 *
 *   Edit    — write a new ClassificationVerdict using RVW Verdict / RVW Cite
 *             / RVW Remarks values. Marks v2 verdict as isCurrent=false,
 *             new MANUAL verdict becomes isCurrent=true.
 *             RVW Cite is parsed as comma-separated scope codes; resolved
 *             via scopeCode → ScopeItem.id; FK-validated.
 *
 *   Reject  — leave v2 verdict as isCurrent=true, write a "rejected by
 *             reviewer" note into clientRequirement.metadata so the App 2
 *             response surfaces it as [REJECTED — needs full re-think].
 *
 *   Hold    — leave v2 as isCurrent=true, write "on hold" note into
 *             metadata. App 2 surfaces as [HOLD — awaiting input].
 *
 *   (blank) — skip; v2 verdict stays as-is.
 *
 * Idempotent — re-running with the same workbook reapplies the same
 * overrides (verdict-writer chokepoint deduplicates).
 *
 * Usage:
 *   $ pnpm tsx scripts/time/apply-reviewer-overrides.ts
 *   $ pnpm tsx scripts/time/apply-reviewer-overrides.ts --file <path>
 *   $ pnpm tsx scripts/time/apply-reviewer-overrides.ts --dry-run
 */

import ExcelJS from "exceljs";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { prisma } from "../../src/lib/db/prisma";

const TIME_ASSESSMENT_ID = "cmopnc80z000263fq9zd4cmlw";
const LOGS_DIR = "/workspaces/aptus/logs";

// Column layout from generate-reviewer-workbook.ts (1-indexed in ExcelJS)
const COL = {
  PRIORITY: 1,
  CODE: 2,
  MODULE: 3,
  TAG: 4,
  REQ_TEXT: 5,
  APTUS_VERDICT: 6,
  TIME_MAP: 7,
  CONFIDENCE: 8,
  CITED_CODES: 9,
  CUSTOMER_PROC: 10,
  PAIN: 11,
  AUTO_REMARKS: 12,
  RVW_VERDICT: 13,
  RVW_CITE: 14,
  RVW_REMARKS: 15,
  DECISION: 16,
  REVIEWER_NOTES: 17,
} as const;

const VALID_DECISIONS = new Set(["Approve", "Edit", "Reject", "Hold"]);
const VALID_VERDICT_PREFIXES = /^(O|C|G|N\/A)\b/;

type Decision = "Approve" | "Edit" | "Reject" | "Hold";

interface OverrideRow {
  code: string;
  decision: Decision;
  rvwVerdict: string;
  rvwCite: string;
  rvwRemarks: string;
  reviewerNotes: string;
}

async function findLatestWorkbook(): Promise<string> {
  const entries = await readdir(LOGS_DIR);
  const candidates = entries
    .filter((e) => /^TIME_Reviewer_Workbook_.*\.xlsx$/.test(e))
    .map((e) => join(LOGS_DIR, e));
  if (candidates.length === 0) throw new Error("No TIME_Reviewer_Workbook_*.xlsx in logs/");
  const stats = await Promise.all(candidates.map(async (c) => ({ path: c, mtime: (await stat(c)).mtimeMs })));
  stats.sort((a, b) => b.mtime - a.mtime);
  return stats[0]!.path;
}

function getCellString(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text).trim();
  if (typeof v === "object" && "result" in v) return String((v as { result: string }).result).trim();
  return String(v).trim();
}

async function loadOverrides(path: string): Promise<OverrideRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const overrides = new Map<string, OverrideRow>();
  let scanned = 0;

  for (const ws of wb.worksheets) {
    if (ws.name.startsWith("0.") || ws.name.startsWith("1.")) continue; // README + Summary
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const code = getCellString(row, COL.CODE);
      if (!code) continue;
      const decision = getCellString(row, COL.DECISION);
      if (!decision) continue;
      if (!VALID_DECISIONS.has(decision)) {
        console.warn(`[apply-rvw] WARN row ${ws.name}:${r} code=${code} invalid decision "${decision}", skipping`);
        continue;
      }
      // Dedup across sheets (Priority Review duplicates per-module rows) —
      // last-seen wins (per-module sheet usually edited last).
      overrides.set(code, {
        code,
        decision: decision as Decision,
        rvwVerdict: getCellString(row, COL.RVW_VERDICT),
        rvwCite: getCellString(row, COL.RVW_CITE),
        rvwRemarks: getCellString(row, COL.RVW_REMARKS),
        reviewerNotes: getCellString(row, COL.REVIEWER_NOTES),
      });
      scanned++;
    }
  }
  console.log(`[apply-rvw] Scanned ${scanned} decision rows across all sheets`);
  console.log(`[apply-rvw] Unique codes with decisions: ${overrides.size}`);
  return Array.from(overrides.values());
}

interface ApplyStats {
  approve: number;
  edit: number;
  reject: number;
  hold: number;
  errors: Array<{ code: string; reason: string }>;
}

async function applyOne(
  ov: OverrideRow,
  scopeCodeToId: Map<string, string>,
  pass: { id: string; protocolVersionId: string },
  stats: ApplyStats,
  dryRun: boolean,
): Promise<void> {
  const req = await prisma.clientRequirement.findFirst({
    where: { assessmentId: TIME_ASSESSMENT_ID, code: ov.code },
    select: {
      id: true,
      sapModule: true,
      verdicts: { where: { isCurrent: true }, select: { id: true, verdict: true, confidence: true, sapModule: true, remarksMd: true, scopeCitations: { select: { scopeItemId: true, role: true } } }, take: 1 },
    },
  });
  if (!req) {
    stats.errors.push({ code: ov.code, reason: "ClientRequirement not found" });
    return;
  }
  const current = req.verdicts[0];
  if (!current) {
    stats.errors.push({ code: ov.code, reason: "No isCurrent verdict — run classify-v2-module-strict first" });
    return;
  }

  let newVerdict: string;
  let newRemarks: string;
  let newSapModule: string | null;
  let newScopeIds: string[] = [];
  let actor: string;
  const noteSuffix = ov.reviewerNotes ? ` — Reviewer: ${ov.reviewerNotes.slice(0, 200)}` : "";

  switch (ov.decision) {
    case "Approve":
      newVerdict = current.verdict;
      newRemarks = current.remarksMd.replace(/^\[REVIEW( NEEDED)?[^\]]*\]\s*/i, "") + noteSuffix;
      newSapModule = current.sapModule;
      newScopeIds = current.scopeCitations.map((c) => c.scopeItemId);
      actor = "abeam-reviewer-approved";
      stats.approve++;
      break;

    case "Edit": {
      // Validate RVW Verdict
      const v = ov.rvwVerdict.trim();
      if (!v) {
        stats.errors.push({ code: ov.code, reason: "Edit decision but RVW Verdict is blank" });
        return;
      }
      // Accept short forms (O / C / G / N/A) and expand to canonical
      const expanded =
        /^O$/i.test(v) ? "O - Out Of The Box" :
        /^C$/i.test(v) ? "C - Configuration" :
        /^G$/i.test(v) ? "G - Gap" :
        /^N\/?A$/i.test(v) ? "N/A - Out of Scope" :
        v;
      if (!VALID_VERDICT_PREFIXES.test(expanded)) {
        stats.errors.push({ code: ov.code, reason: `RVW Verdict "${v}" must start with O / C / G / N/A` });
        return;
      }
      newVerdict = expanded;
      newRemarks = ov.rvwRemarks.trim() || current.remarksMd.replace(/^\[REVIEW[^\]]*\]\s*/i, "");
      newRemarks = newRemarks + noteSuffix;
      newSapModule = current.sapModule;

      // Resolve cited scope codes
      if (ov.rvwCite.trim()) {
        const codes = ov.rvwCite.split(/[,;\s]+/).map((c) => c.trim()).filter(Boolean);
        for (const code of codes) {
          const id = scopeCodeToId.get(code);
          if (!id) {
            stats.errors.push({ code: ov.code, reason: `RVW Cite "${code}" not found in catalog` });
            return;
          }
          newScopeIds.push(id);
        }
      } else {
        newScopeIds = current.scopeCitations.map((c) => c.scopeItemId);
      }
      actor = "abeam-reviewer-edit";
      stats.edit++;
      break;
    }

    case "Reject":
      newVerdict = current.verdict;
      newRemarks = `[REJECTED BY REVIEWER — needs full re-think${noteSuffix ? noteSuffix : ""}] ` + current.remarksMd.replace(/^\[REVIEW[^\]]*\]\s*/i, "");
      newSapModule = current.sapModule;
      newScopeIds = current.scopeCitations.map((c) => c.scopeItemId);
      actor = "abeam-reviewer-rejected";
      stats.reject++;
      break;

    case "Hold":
      newVerdict = current.verdict;
      newRemarks = `[ON HOLD — awaiting reviewer input${noteSuffix ? noteSuffix : ""}] ` + current.remarksMd.replace(/^\[REVIEW[^\]]*\]\s*/i, "");
      newSapModule = current.sapModule;
      newScopeIds = current.scopeCitations.map((c) => c.scopeItemId);
      actor = "abeam-reviewer-hold";
      stats.hold++;
      break;
  }

  if (dryRun) {
    console.log(`  [${ov.code}] ${ov.decision} → verdict=${newVerdict.slice(0, 14)} cites=${newScopeIds.length} actor=${actor}`);
    return;
  }

  // Mark prior current verdict as not current
  await prisma.classificationVerdict.updateMany({
    where: { requirementId: req.id, isCurrent: true },
    data: { isCurrent: false },
  });

  // Insert new verdict
  const verdict = await prisma.classificationVerdict.create({
    data: {
      requirementId: req.id,
      passId: pass.id,
      protocolVersionId: pass.protocolVersionId,
      verdict: newVerdict,
      confidence: "high", // reviewer-endorsed → high
      sapModule: newSapModule,
      remarksMd: newRemarks.slice(0, 1900),
      actor,
      source: "MANUAL",
      isCurrent: true,
    },
  });

  if (newScopeIds.length > 0) {
    await prisma.verdictScopeItem.createMany({
      data: newScopeIds.map((sid, idx) => ({
        verdictId: verdict.id,
        scopeItemId: sid,
        role: idx === 0 ? "primary" : "secondary",
      })),
      skipDuplicates: true,
    });
  }

  // Update read-cache columns
  await prisma.clientRequirement.update({
    where: { id: req.id },
    data: {
      currentVerdictId: verdict.id,
      solutionProviderResponse: newVerdict.slice(0, 3),
      solutionProviderRemarks: newRemarks.slice(0, 1900),
      sapModule: newSapModule,
    },
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : undefined;
  const path = fileArg ?? (await findLatestWorkbook());
  console.log(`[apply-rvw] mode: ${dryRun ? "DRY-RUN" : "WRITE"}`);
  console.log(`[apply-rvw] workbook: ${path}`);

  const overrides = await loadOverrides(path);
  if (overrides.length === 0) {
    console.log(`[apply-rvw] No reviewer decisions found — workbook still pristine.`);
    return;
  }

  // Load assessment + active pass
  const assessment = await prisma.assessment.findUnique({
    where: { id: TIME_ASSESSMENT_ID },
    select: { id: true, catalogVersionId: true },
  });
  if (!assessment?.catalogVersionId) throw new Error("TIME assessment missing catalogVersionId");

  const pass = await prisma.classificationPass.findFirst({
    where: { assessmentId: TIME_ASSESSMENT_ID },
    orderBy: { startedAt: "desc" },
    select: { id: true, protocolVersionId: true },
  });
  if (!pass) throw new Error("No ClassificationPass found");

  // Load scope-code → id map for FK validation
  const scopeItems = await prisma.scopeItem.findMany({
    where: { catalogVersionId: assessment.catalogVersionId },
    select: { id: true, scopeCode: true },
  });
  const scopeCodeToId = new Map(scopeItems.map((s) => [s.scopeCode, s.id]));

  const stats: ApplyStats = { approve: 0, edit: 0, reject: 0, hold: 0, errors: [] };

  for (const ov of overrides) {
    try {
      await applyOne(ov, scopeCodeToId, pass, stats, dryRun);
    } catch (e) {
      stats.errors.push({ code: ov.code, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log(``);
  console.log(`[apply-rvw] Done.`);
  console.log(`  Approve : ${stats.approve}`);
  console.log(`  Edit    : ${stats.edit}`);
  console.log(`  Reject  : ${stats.reject}`);
  console.log(`  Hold    : ${stats.hold}`);
  console.log(`  Errors  : ${stats.errors.length}`);
  for (const e of stats.errors) console.log(`    [${e.code}] ${e.reason}`);
  if (!dryRun && (stats.approve + stats.edit + stats.reject + stats.hold) > 0) {
    console.log(``);
    console.log(`Next: re-generate the App 2 response to surface the new state:`);
    console.log(`  pnpm tsx scripts/time/generate-app2-response.ts`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
