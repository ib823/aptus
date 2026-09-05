/**
 * 2608 WS6 — seed the To-Be rules (and, on request, the Order-to-Cash pilot).
 *
 *   pnpm sap:2608:seed-tobe            # TobeRule rows: BDC ↔ SSCUI cross-reference + curated O2C, upserted
 *   pnpm sap:2608:seed-tobe -- --pilot # …then the pilot affirm bundle with the sample answers, and generate its pack
 *   pnpm sap:2608:seed-tobe -- --dry   # print what would be seeded, write nothing
 *
 * Sources: sap-references/2608/bdc-questionnaires.json (WS5 sidecar) joined to
 * the affirm question bank in the database by verbatim text;
 * src/data/tobe/rules-curated-o2c.json; src/data/tobe/pilot-o2c-answers.json.
 * Rules whose question is not in the database are skipped and counted, never
 * created against a phantom question.
 */
import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { GAP_TYPE_TO_DB, generateAndSavePack } from "../src/lib/tobe/inputs";
import { buildXrefRules, type XrefSheetQuestion } from "../src/lib/tobe/rules-xref";
import type { TobeRuleInput } from "../src/lib/tobe/types";

const ROOT = process.cwd();
const SIDECAR = path.join(ROOT, "sap-references/2608/bdc-questionnaires.json");
const CURATED = path.join(ROOT, "src/data/tobe/rules-curated-o2c.json");
const PILOT = path.join(ROOT, "src/data/tobe/pilot-o2c-answers.json");
export const PILOT_CLIENT = "PILOT · Order to Cash (WS6)";

type Sidecar = {
  questionnaires: {
    id: string;
    questions: {
      row: number;
      question: string;
      sapId: string;
      configRef: string;
      scopeRefs: string[];
      level: string | null;
    }[];
  }[];
};
type Curated = {
  rules: (Omit<TobeRuleInput, "gapType" | "alternatePathId" | "source"> & {
    gapType?: TobeRuleInput["gapType"];
    alternatePathId?: string | null;
  })[];
};
type Pilot = {
  bundle: { client: string; country: string; scopeCodes: string[] };
  answers: { questionId: string; choice: "standard" | "discuss" | "deviate"; reason: string | null }[];
};

export function sheetQuestions(sidecar: Sidecar): XrefSheetQuestion[] {
  return sidecar.questionnaires.flatMap((q) =>
    q.questions.map((x) => ({
      questionnaireId: q.id,
      row: x.row,
      question: x.question,
      sapId: x.sapId,
      configRef: x.configRef,
      scopeRefs: x.scopeRefs,
      level: x.level,
    })),
  );
}

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  const pilot = process.argv.includes("--pilot");
  const prisma = new PrismaClient();
  try {
    const bank = await prisma.affirmQuestion.findMany({
      select: { id: true, sapVerbatim: true, scopeItemRefs: true, sscuiRef: true, format: true },
    });
    if (bank.length === 0) throw new Error("affirm question bank is empty — run `pnpm db:seed` first");
    const sidecar = JSON.parse(fs.readFileSync(SIDECAR, "utf8")) as Sidecar;
    const curated = JSON.parse(fs.readFileSync(CURATED, "utf8")) as Curated;
    const xref = buildXrefRules(bank, sheetQuestions(sidecar));
    const bankIds = new Set(bank.map((q) => q.id));
    const curatedRules: TobeRuleInput[] = curated.rules.map((r) => ({
      ...r,
      gapType: r.gapType ?? null,
      alternatePathId: r.alternatePathId ?? null,
      source: "curated",
    }));
    const all = [...xref, ...curatedRules];
    const skipped = all.filter((r) => !bankIds.has(r.questionId));
    const rules = all.filter((r) => bankIds.has(r.questionId));
    const release = await prisma.sapContentRelease.findFirst({
      where: { release: "2608" },
      orderBy: { loadedAt: "desc" },
      select: { id: true },
    });

    console.log(
      `rules: ${xref.length} from the BDC ↔ SSCUI cross-reference (${new Set(xref.map((r) => r.questionId)).size} questions, ${new Set(xref.map((r) => r.scopeCode)).size} scope items) + ${curatedRules.length} curated; ${skipped.length} skipped (question not in bank)`,
    );
    if (dry) {
      for (const r of rules.slice(0, 12))
        console.log(
          "  ",
          r.id,
          r.trigger,
          "→",
          r.state,
          r.sscuiId,
          r.stepNames.length ? r.stepNames.join("|") : "scope-wide",
        );
      return;
    }
    for (const r of rules) {
      const data = {
        questionId: r.questionId,
        scopeCode: r.scopeCode,
        trigger: r.trigger,
        state: r.state,
        sscuiId: r.sscuiId,
        sscuiName: r.sscuiName,
        gapType: r.gapType ? GAP_TYPE_TO_DB[r.gapType] : null,
        alternatePathId: r.alternatePathId,
        stepNames: r.stepNames,
        source: r.source,
        note: r.note,
        releaseId: release?.id ?? null,
      };
      await prisma.tobeRule.upsert({ where: { id: r.id }, update: data, create: { id: r.id, ...data } });
    }
    const count = await prisma.tobeRule.count();
    console.log(`TobeRule rows now ${count}`);

    if (pilot) {
      const p = JSON.parse(fs.readFileSync(PILOT, "utf8")) as Pilot;
      const missingScope = [];
      for (const code of p.bundle.scopeCodes)
        if (!(await prisma.affirmScopeItem.findUnique({ where: { id: code } }))) missingScope.push(code);
      if (missingScope.length)
        throw new Error(`pilot scope items not in AffirmScopeItem: ${missingScope.join(", ")} — run \`pnpm db:seed\``);
      const existing = await prisma.affirmBundle.findFirst({ where: { client: PILOT_CLIENT }, select: { id: true } });
      const bundle =
        existing ??
        (await prisma.affirmBundle.create({
          data: {
            client: PILOT_CLIENT,
            state: "submitted",
            country: p.bundle.country,
            submittedAt: new Date(),
            issuedAt: new Date(),
          },
          select: { id: true },
        }));
      await prisma.affirmBundleScopeItem.deleteMany({ where: { bundleId: bundle.id } });
      await prisma.affirmBundleScopeItem.createMany({
        data: p.bundle.scopeCodes.map((scopeItemId) => ({ bundleId: bundle.id, scopeItemId })),
      });
      for (const a of p.answers) {
        if (!bankIds.has(a.questionId)) {
          console.log(`  pilot answer ${a.questionId}: question not in bank — skipped`);
          continue;
        }
        await prisma.affirmResponse.upsert({
          where: { bundleId_questionId: { bundleId: bundle.id, questionId: a.questionId } },
          update: { choice: a.choice, reason: a.reason },
          create: { bundleId: bundle.id, questionId: a.questionId, choice: a.choice, reason: a.reason },
        });
      }
      const result = await generateAndSavePack(prisma, bundle.id, null, { generatedAt: new Date().toISOString() });
      if (!result) throw new Error("pilot pack not generated");
      const s = result.doc.summary;
      console.log(
        `pilot bundle ${bundle.id} (${PILOT_CLIENT}): pack ${result.pack.id} — ${s.scopeItems} scope items, ${s.steps} steps, byState ${JSON.stringify(s.byState)}, configured SSCUIs ${s.configuredSscuis}, gaps ${s.gaps}, unanswered ${s.unansweredQuestions}`,
      );
      console.log(`open /tobe/${bundle.id} with TOBE_PACK_ENABLED=true`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
