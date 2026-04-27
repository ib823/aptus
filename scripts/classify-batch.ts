#!/usr/bin/env -S npx tsx
/**
 * SAP-2602 classification orchestrator.
 *
 * Two modes:
 *   emit  — pull a batch of requirements + a relevant 2602 scope-item subset
 *           as JSON. Hand that JSON to a human (or to Claude Code) to
 *           classify per the SAP best-practice protocol.
 *   apply — read a result JSON, validate, and write the classifications back
 *           to ClientRequirement.solutionProviderResponse / Remarks /
 *           erpModuleSupporting. Idempotent.
 *
 * No AI/network calls inside the script — it's just I/O. Lets us drive the
 * classification from a Claude Code CLI session without paying for an
 * Anthropic API key.
 *
 * Usage:
 *   npx tsx scripts/classify-batch.ts emit  --module "Procurement" --out /tmp/batch.json
 *   npx tsx scripts/classify-batch.ts emit  --class functional --limit 50 --out /tmp/batch.json
 *   npx tsx scripts/classify-batch.ts emit  --pending --limit 50 --out /tmp/batch.json
 *   npx tsx scripts/classify-batch.ts apply --in /tmp/results.json
 *
 * Emit always picks the Bursa Malaysia Berhad assessment by default; pass
 * --assessmentId <id> to target a different one.
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  selectRelevantCandidates,
  type CandidateScopeItem,
  type RequirementToClassify,
} from "@/lib/analyzer/classifier";

const prisma = new PrismaClient();

// ── Shared types ────────────────────────────────────────────────────────────

interface EmitFile {
  schemaVersion: 1;
  assessmentId: string;
  assessmentCompany: string;
  filterDescription: string;
  systemPrompt: string;
  candidateScopeItems: CandidateScopeItem[];
  requirements: Array<RequirementToClassify & { id: string; currentClassification: string | null }>;
  instructions: string;
}

interface ResultRow {
  requirementId: string;
  classification: string;       // "O - Out Of The Box" | "C - Configuration" | "G - Gap" | "N/A - Out of Scope" | similar
  remarks: string;              // grounded narrative
  scopeItems: string;           // legacy free-text combined view (kept for back-compat)
  /** New 2026-04-27 structured fields. All optional for back-compat with older
   * result files. When present they're written into the dedicated DB columns
   * surfaced in the XLSX/PDF reports. */
  sapModule?: string;           // controlled vocab: FI-AR, FI-AP, FI-AA, FI-GL, CO, MM, SD, PS, RE-FX, BTP, SuccessFactors, Ariba, SAC, BPA, IS, EAM, "—"
  scopeItemIds?: string;        // comma-separated 2602 IDs only (e.g. "J45, BMD, 19C") or "—"
  scopeItemNames?: string;      // human-readable scope-item names (or product name for Gap)
  confidence?: "high" | "medium" | "low";
}

interface ResultFile {
  schemaVersion: 1;
  assessmentId: string;
  results: ResultRow[];
}

// ── Embedded SAP-2602 protocol (pinned in this file so emits are
//    self-contained even if the analyzer's prompt drifts later). ───────────

const SAP_2602_PROTOCOL = `You are a SAP FIT-to-Standard analyst working with the SAP S/4HANA Cloud Public Edition 2602 catalog.

Your job: classify each requirement in this batch against the candidate 2602 scope items, then produce a grounded narrative.

CLASSIFICATION RULES (use exact strings):
- "O - Out Of The Box"   — capability is in the 2602 baseline as-is, no customization needed
- "C - Configuration"    — capability needs SSCUI / Key User Extensibility / Output Management / Manage Workflows / Adapt UI / Adobe Forms / Communication Arrangement setup, all within the 2602 baseline
- "G - Gap"              — requires a separate licensed SAP product (SuccessFactors EC, Ariba, SAC Planning, SAC Smart Predict, SAP Commerce Cloud, FieldGlass, etc.) OR a 3rd-party tool (Vertex / ONESOURCE for corporate tax, Avalara, Adobe Sign, etc.) — NOT in the 2602 baseline
- "N/A - Out of Scope"   — not a SAP capability question (vendor commercial pre-qualification, ESG offerings, vendor track record, contractual policy, security policy that's the cloud provider's responsibility, etc.)

GROUNDING RULES:
- Reference scope items by ID + name (e.g. "5XU Document and Reporting Compliance")
- Be brutally honest about Gaps — do NOT invent OOTB coverage that isn't in the candidate list
- For Configuration, name the specific config mechanism (SSCUI / KUE / Adapt UI / Manage Workflows / Output Management / Adobe Forms / Communication Arrangement)
- For Gap, explicitly name the separate product needed; note any partial workaround within 2602
- "scopeItems" should be the top 1-3 scope item IDs + names from the candidate list that cover this requirement; empty string if none match (then it's a Gap or N/A by definition)

STRUCTURED FIELDS (REQUIRED for new classifications, 2026-04-27 onward):
- "sapModule" — controlled vocabulary, choose ONE primary:
    OOTB / Config in 2602: FI-AR | FI-AP | FI-AA | FI-GL | CO | MM | SD | PS | RE-FX | TR | TRM
    Gap to non-2602 SAP product: SuccessFactors | Ariba | SAC | BPA | IS | EAM | Convergent-Invoicing | ABAP-Environment | BTP-Other
    Gap to 3rd-party / not SAP: 3rd-party
    N/A bucket: "—" (em-dash)
- "scopeItemIds" — comma-sep 2602 IDs ONLY (e.g. "J45, BMD, 19C"). Use "—" for Gap or N/A.
- "scopeItemNames" — human-readable names matching scopeItemIds order (e.g. "Procurement of Services; Procurement of Direct Materials"). For Gap, the SAP product/component name (e.g. "SuccessFactors Employee Central"). Use "—" for N/A.

OUTPUT FORMAT — write a strict JSON file matching this schema (no preamble, no markdown):
{
  "schemaVersion": 1,
  "assessmentId": "<the assessmentId from the input file>",
  "results": [
    {
      "requirementId": "<id>",
      "classification": "O - Out Of The Box | C - Configuration | G - Gap | N/A - Out of Scope",
      "remarks": "<60-200 words, grounded in scope items + config mechanism / gap product>",
      "scopeItems": "<legacy combined view, e.g. '5XU Document and Reporting Compliance, 1J2 Compliance Formats' — keep for back-compat>",
      "sapModule": "<from controlled vocab above>",
      "scopeItemIds": "<comma-sep IDs only, e.g. 'J45, BMD'>",
      "scopeItemNames": "<human-readable names>",
      "confidence": "high | medium | low"
    }
  ]
}

Write your output to a file at the path the orchestrator tells you, then run:
  npx tsx scripts/classify-batch.ts apply --in <output-file>`;

// ── CLI parsing ─────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

// ── Subcommand: emit ────────────────────────────────────────────────────────

async function emit(): Promise<void> {
  const out = arg("out");
  if (!out) throw new Error("emit requires --out <path>");
  const limit = arg("limit") ? parseInt(arg("limit")!, 10) : 50;

  const assessmentId = arg("assessmentId") ?? (await resolveBursaId());
  const a = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { id: true, companyName: true },
  });
  if (!a) throw new Error(`Assessment not found: ${assessmentId}`);

  const filter: { assessmentId: string; module?: string; requirementClass?: string;
    OR?: Array<{ solutionProviderResponse?: { equals: null } | { equals: "" } | { startsWith: string } }>; } = {
      assessmentId: a.id,
    };
  let filterDescription = "";

  if (arg("module")) {
    filter.module = arg("module")!;
    filterDescription = `Module: ${arg("module")}`;
  } else if (arg("class")) {
    filter.requirementClass = arg("class")!;
    filterDescription = `Class: ${arg("class")}`;
  } else if (flag("pending")) {
    filter.OR = [
      { solutionProviderResponse: { equals: null } },
      { solutionProviderResponse: { equals: "" } },
    ];
    filterDescription = "Pending classification (no current verdict)";
  } else {
    throw new Error("emit requires one of --module, --class, or --pending");
  }

  const reqs = await prisma.clientRequirement.findMany({
    where: filter,
    select: {
      id: true,
      module: true,
      code: true,
      requirementText: true,
      requirementType: true,
      clientRemarks: true,
      solutionProviderResponse: true,
    },
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }],
    take: limit,
  });

  if (reqs.length === 0) {
    console.error(`No requirements matched the filter: ${filterDescription}`);
    process.exit(1);
  }

  const requirementsForClassifier: RequirementToClassify[] = reqs.map((r) => ({
    id: r.id,
    module: r.module,
    code: r.code,
    requirementText: r.requirementText,
    requirementType: r.requirementType,
    clientRemarks: r.clientRemarks,
  }));

  const allItems = await prisma.scopeItem.findMany({
    select: { id: true, name: true, functionalArea: true, totalSteps: true },
  });
  const candidates = selectRelevantCandidates(allItems, requirementsForClassifier);

  const file: EmitFile = {
    schemaVersion: 1,
    assessmentId: a.id,
    assessmentCompany: a.companyName,
    filterDescription,
    systemPrompt: SAP_2602_PROTOCOL,
    candidateScopeItems: candidates,
    requirements: reqs.map((r) => ({
      id: r.id,
      module: r.module,
      code: r.code,
      requirementText: r.requirementText,
      requirementType: r.requirementType,
      clientRemarks: r.clientRemarks,
      currentClassification: r.solutionProviderResponse,
    })),
    instructions:
      `Classify the ${reqs.length} requirement${reqs.length === 1 ? "" : "s"} in "requirements" against the ${candidates.length} candidate scope items in "candidateScopeItems". Follow systemPrompt exactly. Write the result JSON, then run: npx tsx scripts/classify-batch.ts apply --in <result-file>`,
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(file, null, 2));
  console.log(`emit: ${reqs.length} requirements + ${candidates.length} candidates → ${out}`);
  console.log(`filter: ${filterDescription}`);
}

// ── Subcommand: apply ──────────────────────────────────────────────────────

async function apply(): Promise<void> {
  const inPath = arg("in");
  if (!inPath) throw new Error("apply requires --in <path>");
  const raw = fs.readFileSync(inPath, "utf8");
  let parsed: ResultFile;
  try {
    parsed = JSON.parse(raw) as ResultFile;
  } catch (e) {
    throw new Error(`Result file is not valid JSON: ${(e as Error).message}`);
  }

  if (parsed.schemaVersion !== 1) throw new Error(`Expected schemaVersion 1, got ${parsed.schemaVersion}`);
  if (!parsed.assessmentId) throw new Error("Result file missing assessmentId");
  if (!Array.isArray(parsed.results) || parsed.results.length === 0) {
    throw new Error("Result file has no results[]");
  }

  // Validate each row + collect IDs
  const validClassifications = /^(O|C|G|N\/A|NA)\b/i;
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const [i, r] of parsed.results.entries()) {
    const ctx = `results[${i}] (requirementId=${r.requirementId})`;
    if (!r.requirementId) issues.push(`${ctx}: missing requirementId`);
    if (ids.has(r.requirementId)) issues.push(`${ctx}: duplicate requirementId`);
    ids.add(r.requirementId);
    if (!r.classification || !validClassifications.test(r.classification)) {
      issues.push(`${ctx}: classification must start with O / C / G / N/A — got "${r.classification ?? "(empty)"}"`);
    }
    if (typeof r.remarks !== "string") issues.push(`${ctx}: remarks must be a string`);
    if (typeof r.scopeItems !== "string") issues.push(`${ctx}: scopeItems must be a string (comma-sep)`);
  }
  if (issues.length > 0) {
    console.error(`Validation failed (${issues.length} issue${issues.length === 1 ? "" : "s"}):`);
    for (const m of issues.slice(0, 20)) console.error("  - " + m);
    if (issues.length > 20) console.error(`  …and ${issues.length - 20} more`);
    process.exit(1);
  }

  // Verify all referenced requirements exist + belong to the assessment
  const dbRows = await prisma.clientRequirement.findMany({
    where: { assessmentId: parsed.assessmentId, id: { in: [...ids] } },
    select: { id: true },
  });
  const dbIds = new Set(dbRows.map((r) => r.id));
  const missing = [...ids].filter((id) => !dbIds.has(id));
  if (missing.length > 0) {
    console.error(`${missing.length} requirementId(s) in results do not belong to assessment ${parsed.assessmentId}:`);
    for (const m of missing.slice(0, 10)) console.error("  - " + m);
    process.exit(1);
  }

  // Write
  let updated = 0;
  for (const r of parsed.results) {
    await prisma.clientRequirement.update({
      where: { id: r.requirementId },
      data: {
        solutionProviderResponse: r.classification,
        solutionProviderRemarks: r.remarks,
        erpModuleSupporting: r.scopeItems,
        // New structured columns — set when result file provides them, else
        // null so we don't blow away prior values on a partial re-apply.
        ...(r.sapModule !== undefined ? { sapModule: r.sapModule } : {}),
        ...(r.scopeItemIds !== undefined ? { scopeItemIds: r.scopeItemIds } : {}),
        ...(r.scopeItemNames !== undefined ? { scopeItemNames: r.scopeItemNames } : {}),
      },
    });
    updated++;
  }

  // Print a quick distribution summary
  const dist: Record<string, number> = { O: 0, C: 0, G: 0, NA: 0, other: 0 };
  for (const r of parsed.results) {
    const head = r.classification.trim().toUpperCase();
    if (head.startsWith("O")) dist.O = (dist.O ?? 0) + 1;
    else if (head.startsWith("C")) dist.C = (dist.C ?? 0) + 1;
    else if (head.startsWith("G")) dist.G = (dist.G ?? 0) + 1;
    else if (head.startsWith("N")) dist.NA = (dist.NA ?? 0) + 1;
    else dist.other = (dist.other ?? 0) + 1;
  }
  console.log(`apply: wrote ${updated} classification(s) to ClientRequirement`);
  console.log(`  O=${dist.O} · C=${dist.C} · G=${dist.G} · N/A=${dist.NA}${dist.other ? " · other=" + dist.other : ""}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function resolveBursaId(): Promise<string> {
  const a = await prisma.assessment.findFirst({
    where: { companyName: "Bursa Malaysia Berhad", deletedAt: null },
    select: { id: true },
  });
  if (!a) throw new Error("Bursa Malaysia Berhad assessment not found in this DB");
  return a.id;
}

// ── Entrypoint ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sub = process.argv[2];
  if (sub === "emit") return emit();
  if (sub === "apply") return apply();
  if (sub === "--help" || sub === "-h" || !sub) {
    console.log("Usage:");
    console.log("  classify-batch emit  --module <name>   --out <path>  [--limit 50] [--assessmentId <id>]");
    console.log("  classify-batch emit  --class <name>    --out <path>  [--limit 50]");
    console.log("  classify-batch emit  --pending         --out <path>  [--limit 50]");
    console.log("  classify-batch apply --in <path>");
    process.exit(sub ? 0 : 1);
  }
  throw new Error(`Unknown subcommand: ${sub}`);
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
