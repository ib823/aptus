/**
 * Bid-response importer — a requirement-to-scope-item mapping workbook into
 * aptus, with every scope citation validated by the database, not by a comment.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 * aptus already holds the whole Statement-of-Compliance machine: ClientRequirement
 * → ClassificationVerdict → VerdictScopeItem, and `VerdictScopeItem.scopeItemId`
 * is a REAL FOREIGN KEY to ScopeItem. A citation to a scope item that does not
 * exist in the selected catalogue cannot be stored — the write fails.
 *
 * Two tenders have been imported this way before (scripts/import-bursa-requirements.ts,
 * scripts/import-skm-requirements.ts). A third was mapped entirely in spreadsheets,
 * where a wrong code is a string like any other and nothing objects. This importer
 * closes that: the mapping goes in, the FK does the checking, and every code that
 * does not resolve is REPORTED — never silently dropped, and never invented.
 *
 * The FK proves the code EXISTS in the catalogue. It does not prove the code is
 * the RIGHT one for the requirement; that is a consultant's judgement and the
 * verdict's remarks carry it. Do not let the green count read as more than it is.
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *   pnpm bid:import -- --file <path.xlsx> --client "<name>" [--release 2608] [--dry-run]
 *
 * The workbook is NOT committed — `*.xlsx` is gitignored, and client requirement
 * text does not belong in this repository. Pass a path outside it.
 *
 * Expected sheet layout (one sheet per module, headers on row 1):
 *   Req ID · Requirement (verbatim) · Priority · Classification · Scope code(s) ·
 *   Scope item name(s) · Configuration activity / Fiori app / process step ·
 *   How it is met · Prerequisites · Integration · Confidence · Notes
 *
 * Sheets whose headers do not match are skipped and named in the output, so a
 * method or index tab cannot quietly become 60 empty requirements.
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import path from "node:path";

const prisma = new PrismaClient();

/** Header labels that identify a requirement sheet. All must be present. */
const REQUIRED_HEADERS = ["Req ID", "Requirement (verbatim)", "Classification", "Scope code(s)"] as const;

const COLUMNS = {
  reqId: "Req ID",
  text: "Requirement (verbatim)",
  priority: "Priority",
  classification: "Classification",
  scopeCodes: "Scope code(s)",
  scopeNames: "Scope item name(s)",
  artefacts: "Configuration activity / Fiori app / process step",
  howMet: "How it is met",
  prerequisites: "Prerequisites",
  integration: "Integration",
  confidence: "Confidence",
  notes: "Notes",
} as const;

type Row = {
  module: string;
  reqId: string;
  text: string;
  priority: string;
  classification: string;
  scopeCodes: string[];
  artefacts: string;
  howMet: string;
  prerequisites: string;
  integration: string;
  confidence: string;
  notes: string;
  sortOrder: number;
};

type Args = { file: string; client: string; release: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const file = get("--file");
  const client = get("--client");
  if (!file || !client) {
    throw new Error('usage: --file <path.xlsx> --client "<name>" [--release 2608] [--dry-run]');
  }
  return { file, client, release: get("--release") ?? "2608", dryRun: argv.includes("--dry-run") };
}

function cellText(v: ExcelJS.CellValue | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("text" in v) return String(v.text ?? "").trim();
    if ("result" in v) return String(v.result ?? "").trim();
    if (v instanceof Date) return v.toISOString();
    return "";
  }
  return String(v).trim();
}

/**
 * Split a scope-code cell. Same shape as the SSCUI and forms sources — comma or
 * semicolon separated — and split the same way, verbatim, de-duplicated.
 */
export function scopeCodesFrom(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,;]/)) {
    const code = part.trim().toUpperCase();
    if (code && code !== "—" && code !== "-" && !out.includes(code)) out.push(code);
  }
  return out;
}

export function readWorkbookRows(wb: ExcelJS.Workbook): { rows: Row[]; skipped: string[] } {
  const rows: Row[] = [];
  const skipped: string[] = [];
  for (const ws of wb.worksheets) {
    const headers = Array.from(ws.getRow(1).values as ExcelJS.CellValue[], (v) => cellText(v ?? null));
    const index = new Map<string, number>();
    headers.forEach((h, i) => {
      if (h && !index.has(h)) index.set(h, i);
    });
    if (!REQUIRED_HEADERS.every((h) => index.has(h))) {
      skipped.push(ws.name);
      continue;
    }
    const at = (cells: string[], header: string): string => {
      const i = index.get(header);
      return i === undefined ? "" : (cells[i] ?? "");
    };
    let sortOrder = 0;
    for (let r = 2; r <= ws.rowCount; r++) {
      const cells = Array.from(ws.getRow(r).values as ExcelJS.CellValue[], (v) => cellText(v ?? null));
      const reqId = at(cells, COLUMNS.reqId);
      const text = at(cells, COLUMNS.text);
      if (!reqId || !text) continue;
      rows.push({
        module: ws.name,
        reqId,
        text,
        priority: at(cells, COLUMNS.priority),
        classification: at(cells, COLUMNS.classification),
        scopeCodes: scopeCodesFrom(at(cells, COLUMNS.scopeCodes)),
        artefacts: at(cells, COLUMNS.artefacts),
        howMet: at(cells, COLUMNS.howMet),
        prerequisites: at(cells, COLUMNS.prerequisites),
        integration: at(cells, COLUMNS.integration),
        confidence: at(cells, COLUMNS.confidence),
        notes: at(cells, COLUMNS.notes),
        sortOrder: sortOrder++,
      });
    }
  }
  return { rows, skipped };
}

/**
 * The verdict column is stored VERBATIM.
 *
 * ClassificationVerdict.verdict documents four values (O / C / G / N/A), but a
 * mapping workbook also carries "E" for extension and "NEEDS REVIEW" for a row
 * that could not be classified with confidence. Folding those into the four
 * would misreport the second as an answer — NEEDS REVIEW is precisely the state
 * of not having one. They are kept as they were written.
 */
function normaliseConfidence(raw: string): string | null {
  const c = raw.trim().toLowerCase();
  if (c.startsWith("high")) return "high";
  if (c.startsWith("med")) return "medium";
  if (c.startsWith("low")) return "low";
  return null;
}

function remarksFor(row: Row): string {
  const parts: string[] = [];
  if (row.howMet) parts.push(`**How it is met**\n\n${row.howMet}`);
  if (row.artefacts) parts.push(`**Artefacts cited**\n\n${row.artefacts}`);
  if (row.prerequisites) parts.push(`**Prerequisites**\n\n${row.prerequisites}`);
  if (row.integration && row.integration !== "—") parts.push(`**Integration**\n\n${row.integration}`);
  if (row.notes) parts.push(`**Notes**\n\n${row.notes}`);
  return parts.join("\n\n") || "(no remarks in the source workbook)";
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(args.file));
  const { rows, skipped } = readWorkbookRows(wb);

  console.log(`bid:import — ${args.client} · release ${args.release}`);
  console.log(`  source                ${args.file}`);
  console.log(`  requirement rows      ${rows.length} across ${new Set(rows.map((r) => r.module)).size} module sheet(s)`);
  if (skipped.length) console.log(`  sheets skipped (no requirement headers): ${skipped.join(", ")}`);
  if (rows.length === 0) {
    console.error("  ! refused: no requirement rows found — the sheet layout moved, not the requirements");
    return 1;
  }

  const catalog = await prisma.scopeCatalogVersion.findFirst({
    where: { edition: "PUBLIC", version: args.release },
  });
  if (!catalog) {
    console.error(`  ! refused: no ScopeCatalogVersion PUBLIC/${args.release} — run the 2608 loaders first`);
    return 1;
  }
  const scopeItems = await prisma.scopeItem.findMany({
    where: { catalogVersionId: catalog.id },
    select: { id: true, scopeCode: true, lifecycleStatus: true },
  });
  const byCode = new Map(scopeItems.map((s) => [s.scopeCode.toUpperCase(), s]));
  console.log(`  catalogue             PUBLIC/${args.release} · ${scopeItems.length} scope items`);

  // Resolve every citation BEFORE writing anything: an unresolvable code is a
  // finding about the mapping, and it should be reported whole rather than
  // discovered one failed insert at a time.
  const cited = new Set(rows.flatMap((r) => r.scopeCodes));
  const unresolved = [...cited].filter((c) => !byCode.has(c)).sort();
  const notActive = [...cited]
    .map((c) => byCode.get(c))
    .filter((s): s is NonNullable<typeof s> => Boolean(s) && s!.lifecycleStatus !== "ACTIVE");
  console.log(`  distinct codes cited  ${cited.size} · resolve ${cited.size - unresolved.length} · do NOT resolve ${unresolved.length}`);
  if (unresolved.length) {
    console.log(`  ! codes with no scope item in PUBLIC/${args.release}: ${unresolved.join(", ")}`);
    for (const code of unresolved) {
      const where = rows.filter((r) => r.scopeCodes.includes(code)).map((r) => `${r.module} ${r.reqId}`);
      console.log(`      ${code.padEnd(6)} cited by ${where.length} row(s): ${where.slice(0, 6).join(", ")}${where.length > 6 ? " …" : ""}`);
    }
  }
  if (notActive.length) {
    console.log(`  ! cited but NOT ACTIVE: ${notActive.map((s) => `${s.scopeCode} (${s.lifecycleStatus})`).join(", ")}`);
  }

  const byVerdict = new Map<string, number>();
  for (const r of rows) byVerdict.set(r.classification || "(blank)", (byVerdict.get(r.classification || "(blank)") ?? 0) + 1);
  console.log("  classification:");
  for (const [k, v] of [...byVerdict].sort()) console.log(`     ${k.padEnd(16)} ${v}`);

  if (args.dryRun) {
    console.log("  dry-run: no database write");
    return unresolved.length === 0 ? 0 : 1;
  }

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org || !user) {
    console.error("  ! refused: no Organization/User to own the assessment — seed the database first");
    return 1;
  }

  let assessment = await prisma.assessment.findFirst({
    where: { companyName: args.client, organizationId: org.id, deletedAt: null },
  });
  if (!assessment) {
    assessment = await prisma.assessment.create({
      data: {
        companyName: args.client,
        industry: "Unspecified",
        country: "MY",
        operatingCountries: ["MY"],
        companySize: "Unspecified",
        sapVersion: args.release,
        catalogVersionId: catalog.id,
        createdBy: user.id,
        organizationId: org.id,
      },
    });
    console.log(`  created assessment    ${assessment.id}`);
  } else {
    console.log(`  existing assessment   ${assessment.id}`);
  }

  const protocolName = `Bid response · SAP Cloud ERP ${args.release}`;
  const protocol =
    (await prisma.classificationProtocol.findFirst({ where: { name: protocolName, version: "1.0.0" } })) ??
    (await prisma.classificationProtocol.create({
      data: {
        name: protocolName,
        version: "1.0.0",
        catalogVersionId: catalog.id,
        bucketDefinitions: {
          O: "Standard — delivered as shipped, activation only",
          C: "Configuration — standard once configured",
          E: "Extension — key-user, side-by-side or integration",
          G: "Gap — no standard route",
          "N/A": "Out of scope",
          "NEEDS REVIEW": "Not classifiable with confidence from the content",
        },
        groundingRules:
          "Every citation is validated against the selected scope catalogue by foreign key. A code that does not resolve is reported and the row is imported without that citation — it is never replaced with a plausible one.",
        systemPrompt: "(imported mapping — no AI pass; verdicts are as written by the consultant)",
      },
    }));

  const pass = await prisma.classificationPass.create({
    data: {
      assessmentId: assessment.id,
      protocolVersionId: protocol.id,
      catalogVersionId: catalog.id,
      actor: "bid-import",
      actorRole: "consultant",
      summaryJson: {
        source: path.basename(args.file),
        rows: rows.length,
        citedCodes: cited.size,
        unresolvedCodes: unresolved,
      } as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });

  let inserted = 0;
  let updated = 0;
  let citations = 0;
  for (const row of rows) {
    const existing = await prisma.clientRequirement.findFirst({
      where: { assessmentId: assessment.id, module: row.module, code: row.reqId },
    });
    const data = {
      module: row.module,
      code: row.reqId,
      requirementText: row.text,
      requirementType: row.priority || null,
      requirementClass: "functional",
      sortOrder: row.sortOrder,
    };
    const requirement = existing
      ? await prisma.clientRequirement.update({ where: { id: existing.id }, data })
      : await prisma.clientRequirement.create({ data: { ...data, assessmentId: assessment.id } });
    if (existing) updated++;
    else inserted++;

    // Supersede any prior verdict rather than deleting it — the history is the
    // point of the model.
    await prisma.classificationVerdict.updateMany({
      where: { requirementId: requirement.id, isCurrent: true },
      data: { isCurrent: false },
    });
    const verdict = await prisma.classificationVerdict.create({
      data: {
        requirementId: requirement.id,
        passId: pass.id,
        protocolVersionId: protocol.id,
        verdict: row.classification || "NEEDS REVIEW",
        confidence: normaliseConfidence(row.confidence),
        remarksMd: remarksFor(row),
        actor: "bid-import",
        source: "REIMPORT",
      },
    });

    const resolved = row.scopeCodes.map((c) => byCode.get(c)).filter((s): s is NonNullable<typeof s> => Boolean(s));
    if (resolved.length) {
      await prisma.verdictScopeItem.createMany({
        data: resolved.map((s, i) => ({
          verdictId: verdict.id,
          scopeItemId: s.id,
          role: i === 0 ? "primary" : "secondary",
        })),
        skipDuplicates: true,
      });
      citations += resolved.length;
    }
  }

  const storedCitations = await prisma.verdictScopeItem.count({ where: { verdict: { passId: pass.id } } });
  console.log(`\nbid:import === complete ===`);
  console.log(`  requirements inserted ${inserted} · updated ${updated}`);
  console.log(`  scope citations       ${storedCitations} stored (${citations} resolved from ${rows.reduce((n, r) => n + r.scopeCodes.length, 0)} cited)`);
  console.log(`  assessment            ${assessment.id}`);
  console.log(`  pass                  ${pass.id}`);
  if (unresolved.length) {
    console.log(`  ! ${unresolved.length} code(s) could not be cited because no scope item carries them: ${unresolved.join(", ")}`);
    console.log(`    The rows imported without those citations. Fix the mapping, then re-run.`);
  }
  return 0;
}

/*
 * Only run when executed directly. The reader is exported for tests, and a
 * bare `main()` at module scope would parse argv and open a database client
 * inside the test process the moment the module is imported.
 */
const executedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]).endsWith("import-bid-requirements.ts");
if (executedDirectly) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
