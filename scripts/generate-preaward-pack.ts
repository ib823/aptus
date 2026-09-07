/**
 * 2608 WS14 — generate a To-Be pack before an engagement exists.
 *
 *   pnpm tobe:preaward -- --client "<name>" --codes J59,J60,BD9 [--countries MY,PH]
 *   pnpm tobe:preaward -- --client "<name>" --from-assessment <id> [--countries MY,PH]
 *
 * The WS6 pack generator reads an AffirmBundle: a client, a scope set, and the
 * answers they gave to the Fit-to-Standard questions. At bid time there is no
 * client to answer anything, and that is exactly the case this script covers —
 * it creates a bundle with a scope set and NO answers, so every step comes out
 * of the engine in its published state and every question comes out unanswered.
 *
 * That is not a degraded pack. It is the honest pre-award one: `SAP standard —
 * cited` on what SAP publishes, `Confirm with client` on everything a client
 * would have to settle, and the second number is meant to be large.
 *
 * Client-agnostic. The client name and the scope set are arguments; nothing
 * about any particular bid is in this file, and no client data enters the
 * repository through it.
 *
 * `--from-assessment` reads the scope codes a bid response already cited
 * (VerdictScopeItem, landed by `pnpm bid:import`), so the pack covers the same
 * items the compliance response does rather than a list retyped beside it.
 */
import { PrismaClient } from "@prisma/client";

import { generateAndSavePack } from "@/lib/tobe/inputs";

type Args = {
  client: string;
  codes: string[];
  assessmentId: string | null;
  countries: string[];
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null;
  };
  const list = (flag: string): string[] =>
    (get(flag) ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  const client = get("--client");
  if (!client) throw new Error("--client is required");
  const codes = list("--codes");
  const assessmentId = get("--from-assessment");
  if (codes.length === 0 && !assessmentId)
    throw new Error("give either --codes A,B,C or --from-assessment <id>");
  return {
    client,
    codes,
    assessmentId,
    countries: list("--countries"),
    dryRun: argv.includes("--dry-run"),
  };
}

/** Scope codes a bid response already cited, deduplicated and sorted. */
async function codesFromAssessment(prisma: PrismaClient, assessmentId: string): Promise<string[]> {
  const rows = await prisma.verdictScopeItem.findMany({
    // ClassificationPass carries assessmentId directly; the protocol beside it
    // is the protocol VERSION, not the assessment.
    where: { verdict: { pass: { assessmentId } } },
    select: { scopeItem: { select: { scopeCode: true } } },
  });
  return [...new Set(rows.map((r) => r.scopeItem.scopeCode))].sort();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const codes = args.assessmentId ? await codesFromAssessment(prisma, args.assessmentId) : args.codes;
    if (codes.length === 0) throw new Error("no scope codes resolved — nothing to draw");

    /*
     * Resolve every code against the catalogue BEFORE writing anything, and
     * report the whole failure at once. Discovering an unknown code one failed
     * insert at a time is the WS12 lesson, and it applies here too.
     */
    const catalogue = await prisma.scopeItem.findMany({
      where: { scopeCode: { in: codes }, catalogVersion: { edition: "PUBLIC", version: "2608" } },
      select: { scopeCode: true },
    });
    const known = new Set(catalogue.map((c) => c.scopeCode));
    const unknown = codes.filter((c) => !known.has(c));
    if (unknown.length > 0) {
      console.error(`\n${unknown.length} scope code(s) do not exist in PUBLIC/2608: ${unknown.join(", ")}`);
      console.error("Nothing was written. Fix the list or load the catalogue first.\n");
      process.exitCode = 1;
      return;
    }

    /*
     * AffirmBundleScopeItem.scopeItemId is a foreign key to AffirmScopeItem,
     * whose id IS the SAP scope code — so a code that exists in the catalogue
     * can still fail to attach if the BDC hierarchy has not been loaded. Say
     * which codes and which loader, rather than surfacing a raw
     * "Foreign key constraint violated" that names neither.
     */
    const affirmKnown = await prisma.affirmScopeItem.findMany({
      where: { id: { in: codes } },
      select: { id: true },
    });
    const affirmSet = new Set(affirmKnown.map((a) => a.id));
    const missingFromAffirm = codes.filter((c) => !affirmSet.has(c));
    if (missingFromAffirm.length > 0) {
      console.error(
        `\n${missingFromAffirm.length} of ${codes.length} scope code(s) exist in the 2608 catalogue but have no AffirmScopeItem row:`,
      );
      console.error(`  ${missingFromAffirm.join(", ")}`);
      console.error(
        affirmKnown.length === 0
          ? "\nThe BDC hierarchy is not loaded in this database. Run `pnpm sap:2608:load-bdc` first.\nNothing was written.\n"
          : "\nThe BDC hierarchy is loaded but does not cover these items. SAP publishes BDC\nquestions for a subset of the catalogue; a scope item outside it cannot join an\naffirm bundle. Drop those codes or extend the hierarchy.\nNothing was written.\n",
      );
      process.exitCode = 1;
      return;
    }

    console.log(`client        ${args.client}`);
    console.log(`scope codes   ${codes.length} (all resolve in PUBLIC/2608)`);
    console.log(`countries     ${args.countries.length > 0 ? args.countries.join(", ") : "(not stated — nothing filtered)"}`);
    if (args.dryRun) {
      console.log("\n--dry-run: no bundle created, no pack written.");
      return;
    }

    const bundle = await prisma.affirmBundle.create({
      data: {
        client: args.client,
        // Pre-award, and the state says so. A bundle that looks "draft" is one
        // somebody may later mistake for a client's own answers.
        state: "preaward",
        countries: args.countries,
        ...(args.countries.length === 1 ? { country: args.countries[0]! } : {}),
        scopeItems: { create: codes.map((scopeItemId) => ({ scopeItemId })) },
      },
      select: { id: true },
    });

    const result = await generateAndSavePack(prisma, bundle.id, null);
    if (!result) throw new Error("pack generation returned nothing");
    const { doc, pack } = result;
    const s = doc.summary;

    const pct = (n: number): string => (s.steps === 0 ? "0%" : `${Math.round((n / s.steps) * 100)}%`);
    console.log(`\nbundle        ${bundle.id}`);
    console.log(`pack          ${pack.id}`);
    console.log(`release       ${doc.release}`);
    console.log(`\nscope items   ${s.scopeItems} in scope`);
    console.log(`  steps drawn from a BPD             ${s.bySource.BPD} item(s)`);
    console.log(`  steps drawn from the step master   ${s.bySource.PROCESS_STEP_MASTER} item(s)`);
    console.log(`  no published steps at all          ${s.itemsWithoutSteps} item(s)`);
    console.log(`\nprocess steps ${s.steps}`);
    console.log(`  SAP standard — cited               ${s.byDisposition.SAP_STANDARD_CITED}  ${pct(s.byDisposition.SAP_STANDARD_CITED)}`);
    console.log(`  Confirm with client                ${s.byDisposition.CONFIRM_WITH_CLIENT}  ${pct(s.byDisposition.CONFIRM_WITH_CLIENT)}`);
    console.log(`  Not in scope (chain context)       ${s.byDisposition.NOT_IN_SCOPE}`);
    if (s.stepsExcludedByCountry > 0)
      console.log(`  excluded by country footprint      ${s.stepsExcludedByCountry}`);
    console.log(
      `\nend-to-end    forms ${s.forms} (${s.formPlacements} placements) · integrations ${s.integrations} (${s.integrationLinks} links) · restrictions ${s.restrictions}`,
    );
    console.log(`workshop      ${s.confirmInWorkshop} scope item(s) flagged · ${s.unansweredQuestions} question(s) unanswered`);
    console.log(`\nfingerprint   inputs ${doc.hashes.inputs.slice(0, 16)}`);
    console.log(`\nView it at /tobe/${bundle.id} (needs TOBE_PACK_ENABLED).`);
  } finally {
    await prisma.$disconnect();
  }
}

const executedDirectly =
  process.argv[1] !== undefined && process.argv[1].endsWith("generate-preaward-pack.ts");
if (executedDirectly) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
