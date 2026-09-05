/**
 * WS1 — re-validate every SSCUI citation in the FTS content against the 2608
 * SSCUI list (Content Reconciliation D1 follow-up).
 *
 * Two questions, answered from the file, not from memory:
 *   1. Does every NUMERIC sscui_id cited in src/lib/fts/** and
 *      scripts/decisions-yaml/** still exist in 2608, and does its 2608 name
 *      still match the cited name?
 *   2. For each D1 placeholder decision (sscui_id "" + a framework label such
 *      as "Output Management (OM)"), is there now ONE real 2608 activity that
 *      the label unambiguously names? Only an exact, unique match is proposed;
 *      a framework that maps to many activities stays a framework.
 *
 * Writes docs/2608/sscui-citation-revalidation.md. Never edits content files —
 * a human (or the follow-up commit) applies the proposals it prints.
 *
 * Usage:  pnpm sap:2608:revalidate-sscui
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { sapContentSourcesFor } from "./lib/sap-content-sources";
import { parseSscuiList, type SscuiRow } from "./lib/sap-2608/parse";

const ROOT = process.cwd();
const CONTENT_GLOBS = ["src/lib/fts/data", "src/lib/fts/value-streams", "scripts/decisions-yaml", "curation-model"];
const OUT = "docs/2608/sscui-citation-revalidation.md";

/** The D1 placeholders and the search terms that would identify a single real activity. */
const PLACEHOLDERS: { token: string; label: string; terms: string[] }[] = [
  {
    token: "OM",
    label: "Output Management",
    terms: ["output management", "output parameter determination", "output control"],
  },
  { token: "FW", label: "Flexible Workflow", terms: ["flexible workflow", "workflow for sales", "manage workflows"] },
  {
    token: "ATP",
    label: "Advanced Available-to-Promise",
    terms: ["available-to-promise", "availability check", "aatp", "product allocation"],
  },
  { token: "CM", label: "SAP Credit Management", terms: ["credit management", "credit segment", "credit limit"] },
  { token: "PR", label: "Pricing", terms: ["pricing procedure", "condition type", "condition table"] },
  {
    token: "DS",
    label: "Delivery split / consolidation",
    terms: ["delivery split", "combine", "delivery consolidation"],
  },
  { token: "QV", label: "Quotation validity", terms: ["validity period", "quotation", "proposed valid"] },
  { token: "PC", label: "Partner / contact", terms: ["partner determination", "partner function", "contact person"] },
  { token: "SR", label: "Sales rejection reasons", terms: ["reasons for rejection", "rejection reason"] },
  { token: "OVAG", label: "Define Reasons for Rejection (transaction OVAG)", terms: ["reasons for rejection"] },
];

function walk(dir: string, out: string[] = []): string[] {
  const abs = path.resolve(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|yaml|yml)$/.test(e.name)) out.push(p);
  }
  return out;
}

type Citation = { file: string; line: number; id: string; context: string };

function collectNumericCitations(files: string[]): Citation[] {
  const out: Citation[] = [];
  const re = /\b(?:sscui_id|sscuiId|sscui)\s*[:=]\s*['"]?(\d{2,6})\b/g;
  for (const f of files) {
    const lines = fs.readFileSync(path.resolve(ROOT, f), "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const m of line.matchAll(re))
        out.push({ file: f, line: i + 1, id: m[1]!, context: line.trim().slice(0, 120) });
    });
  }
  return out;
}

function collectPlaceholderDecisions(
  files: string[],
): { file: string; line: number; label: string; context: string }[] {
  const out: { file: string; line: number; label: string; context: string }[] = [];
  for (const f of files) {
    const lines = fs.readFileSync(path.resolve(ROOT, f), "utf8").split("\n");
    lines.forEach((line, i) => {
      // sscui_id: "" followed (within the next 3 lines or the previous 3) by a sscui_name / sscui label.
      if (/\bsscui_id\s*[:=]\s*['"]{2}/.test(line)) {
        const window = lines.slice(Math.max(0, i - 3), i + 4).join(" ");
        const name = /\bsscui(?:_name)?\s*[:=]\s*['"]([^'"]+)['"]/.exec(window)?.[1] ?? "";
        out.push({ file: f, line: i + 1, label: name, context: line.trim().slice(0, 100) });
      }
    });
  }
  return out;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function main(): Promise<number> {
  const sources = sapContentSourcesFor("2608");
  const sscui = await parseSscuiList(sources);
  const byId = new Map<string, SscuiRow[]>();
  for (const r of sscui) (byId.get(r.activityId) ?? byId.set(r.activityId, []).get(r.activityId)!).push(r);

  const files = CONTENT_GLOBS.flatMap((d) => walk(d));
  const numeric = collectNumericCitations(files);
  const placeholders = collectPlaceholderDecisions(files);

  const missing: Citation[] = [];
  const renamed: (Citation & { name2608: string })[] = [];
  const ok: Citation[] = [];
  for (const c of numeric) {
    const rows = byId.get(c.id);
    if (!rows) {
      missing.push(c);
      continue;
    }
    // Only a plain "<id> - <name>" label is compared; composite range labels such as
    // "104274/75/76 - Pricing Date logic" name several activities on purpose.
    const citedName = new RegExp(`\\b${c.id}\\s+[-–—]\\s+([^'"]+)`).exec(c.context)?.[1]?.trim();
    const names = rows.map((r) => r.activityDescription);
    if (citedName && !names.some((n) => norm(n) === norm(citedName))) renamed.push({ ...c, name2608: names[0]! });
    else ok.push(c);
  }

  const proposals: { token: string; label: string; matches: { id: string; name: string; scopeItems: string }[] }[] = [];
  for (const p of PLACEHOLDERS) {
    const matches = sscui.filter((r) =>
      p.terms.some((t) => norm(r.activityDescription).includes(norm(t)) || norm(r.configItemName).includes(norm(t))),
    );
    const uniq = new Map<string, SscuiRow>();
    for (const m of matches) if (!uniq.has(m.activityId)) uniq.set(m.activityId, m);
    proposals.push({
      token: p.token,
      label: p.label,
      matches: [...uniq.values()]
        .slice(0, 12)
        .map((r) => ({ id: r.activityId, name: r.activityDescription, scopeItems: r.mainScopeItemIds })),
    });
  }

  const md: string[] = [];
  md.push("# SSCUI citation re-validation against the 2608 list", "");
  md.push(
    `Generated by \`scripts/revalidate-sscui-citations-2608.ts\` on ${new Date().toISOString().slice(0, 10)} from \`${sources.sscui!.file}\` (sheet \`${sources.sscui!.sheet}\`, ${sscui.length} rows, ${byId.size} IDs).`,
    "",
  );
  md.push(`Scanned: ${files.length} content files under ${CONTENT_GLOBS.map((g) => `\`${g}\``).join(", ")}.`, "");
  md.push("## 1 · Numeric citations", "");
  md.push(
    `| Result | Count |`,
    `|---|---|`,
    `| Cited ID exists in 2608, name matches | ${ok.length} |`,
    `| Cited ID exists, 2608 name differs | ${renamed.length} |`,
    `| Cited ID NOT in 2608 | ${missing.length} |`,
    "",
  );
  if (missing.length) {
    md.push("### Not in 2608 (fix required)", "", "| File:line | ID | Context |", "|---|---|---|");
    for (const c of missing) md.push(`| \`${c.file}:${c.line}\` | ${c.id} | ${c.context.replace(/\|/g, "\\|")} |`);
    md.push("");
  }
  if (renamed.length) {
    md.push("### Name drift (ID valid, 2608 wording differs)", "", "| File:line | ID | 2608 name |", "|---|---|---|");
    for (const c of renamed) md.push(`| \`${c.file}:${c.line}\` | ${c.id} | ${c.name2608.replace(/\|/g, "\\|")} |`);
    md.push("");
  }
  md.push('## 2 · D1 placeholder decisions (sscui_id "")', "");
  md.push(`${placeholders.length} decision(s) still carry an empty \`sscui_id\` with a framework label:`, "");
  for (const p of placeholders) md.push(`- \`${p.file}:${p.line}\` — ${p.label || "(no label found)"}`);
  md.push("", "### Candidate real 2608 activities per shorthand", "");
  md.push(
    "A shorthand is replaceable only when exactly ONE activity answers it. Frameworks that resolve to many activities stay frameworks (the D1 decision stands).",
    "",
  );
  md.push(
    'Resolved in WS1 by scope-item coverage rather than by name alone: **SR / OVAG → 102494 "Define Reasons for Rejection"** (Sales / Basic Functions) — its main scope items include 1IQ, BD9 and BDG, whereas 103852 "Reasons for Rejection" is Contract and Lease Management and covers none of them. Applied to 1IQ d3 (YAML + generated TS) and the curation model.',
    "",
  );
  for (const p of proposals) {
    md.push(
      `#### ${p.token} — ${p.label}: ${p.matches.length === 0 ? "no match" : p.matches.length === 1 ? "**one unique match → replace**" : `${p.matches.length} candidates (ambiguous — keep as framework)`}`,
      "",
    );
    if (p.matches.length) {
      md.push("| ID | 2608 activity | Main scope items |", "|---|---|---|");
      for (const m of p.matches)
        md.push(`| ${m.id} | ${m.name.replace(/\|/g, "\\|")} | ${m.scopeItems.slice(0, 40)} |`);
      md.push("");
    }
  }
  fs.writeFileSync(path.resolve(ROOT, OUT), md.join("\n") + "\n");
  console.log(
    `revalidate-sscui-citations-2608 — numeric: ${ok.length} ok · ${renamed.length} renamed · ${missing.length} missing · placeholders: ${placeholders.length} · report ${OUT}`,
  );
  for (const c of missing) console.log(`  ! missing in 2608: ${c.id} at ${c.file}:${c.line}`);
  for (const p of proposals)
    console.log(
      `  ${p.token.padEnd(5)} ${String(p.matches.length).padStart(3)} candidate(s)${p.matches.length === 1 ? ` → ${p.matches[0]!.id} ${p.matches[0]!.name}` : ""}`,
    );
  return missing.length ? 1 : 0;
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
