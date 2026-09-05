/**
 * 2608 WS6 — load the engine's inputs for one affirm bundle ("engagement") and
 * persist a generated pack. The only place the pack touches the database.
 *
 *   scope set   AffirmBundleScopeItem rows of the bundle (SAP scope codes)
 *   answers     AffirmResponse rows (standard | discuss | deviate + reason)
 *   questions   AffirmQuestion rows naming any scoped item
 *   rules       TobeRule rows for the scoped + chained items
 *   contents    the 2608 BPD data files (src/lib/fts/data) — steps come from here only
 *   chains      sap-references/2608/e2e-chains.json
 */
import type { PrismaClient, Prisma } from "@prisma/client";

import { scopeItems as FTS_DATA } from "@/lib/fts/data";
import { resolveSapContentRelease } from "@/lib/sap-content/release";

import { chainsForScope } from "./chains";
import { generateTobePack } from "./engine";
import type {
  TobeEngineInput,
  TobeGapType,
  TobePackDoc,
  TobeRuleInput,
  TobeScopeContent,
  TobeStepState,
  TobeTrigger,
} from "./types";

type Db = Pick<PrismaClient, "affirmBundle" | "affirmQuestion" | "tobeRule" | "tobePack" | "sapContentRelease">;

const GAP_TYPE_FROM_DB: Record<string, TobeGapType> = {
  EXTENSION: "extension",
  WORKAROUND: "workaround",
  INTEGRATION: "integration",
  OUT_OF_SCOPE: "out-of-scope",
};
export const GAP_TYPE_TO_DB: Record<TobeGapType, "EXTENSION" | "WORKAROUND" | "INTEGRATION" | "OUT_OF_SCOPE"> = {
  extension: "EXTENSION",
  workaround: "WORKAROUND",
  integration: "INTEGRATION",
  "out-of-scope": "OUT_OF_SCOPE",
};

/** The BPD data files as engine content — value streams (O2C-SALES) are not scope items. */
export function ftsContents(codes: string[]): Record<string, TobeScopeContent> {
  const out: Record<string, TobeScopeContent> = {};
  for (const code of codes) {
    const c = FTS_DATA[code];
    if (!c || c.value_stream) continue;
    out[code] = {
      code: c.code,
      title: c.title,
      release: c.release,
      business_roles: c.business_roles,
      process_steps: c.process_steps,
    };
  }
  return out;
}

/** The release the contents carry (all 2608 data files say so); env default as the fallback. */
export function releaseOf(contents: Record<string, TobeScopeContent>): string {
  for (const c of Object.values(contents)) {
    const m = c.release.match(/\b(\d{4})\b/);
    if (m) return m[1]!;
  }
  return resolveSapContentRelease().release;
}

export interface LoadedBundle {
  id: string;
  client: string;
  state: string;
  createdById: string | null;
}

export async function loadTobeInputs(
  db: Db,
  bundleId: string,
  opts: { generatedAt?: string; consultantNotes?: Record<string, string> } = {},
): Promise<{ bundle: LoadedBundle; input: TobeEngineInput } | null> {
  const bundle = await db.affirmBundle.findUnique({
    where: { id: bundleId },
    select: {
      id: true,
      client: true,
      state: true,
      createdById: true,
      scopeItems: { select: { scopeItemId: true } },
      responses: { select: { questionId: true, choice: true, reason: true } },
    },
  });
  if (!bundle) return null;
  const scopeCodes = bundle.scopeItems.map((s) => s.scopeItemId).sort();
  const chains = chainsForScope(scopeCodes);
  const chainCodes = chains.flatMap((c) => [...c.path, ...c.alternates.flatMap((a) => a.via)]);
  const allCodes = Array.from(new Set([...scopeCodes, ...chainCodes]));

  const [questions, rules] = await Promise.all([
    db.affirmQuestion.findMany({
      where: { scopeItemRefs: { hasSome: allCodes } },
      select: {
        id: true,
        sapVerbatim: true,
        scopeItemRefs: true,
        sscuiRef: true,
        sourceQuestionnaire: true,
        format: true,
      },
      orderBy: { id: "asc" },
    }),
    db.tobeRule.findMany({ where: { scopeCode: { in: allCodes } }, orderBy: { id: "asc" } }),
  ]);
  const contents = ftsContents(allCodes);
  const input: TobeEngineInput = {
    release: releaseOf(contents),
    scopeCodes,
    contents,
    answers: bundle.responses
      .filter(
        (r): r is typeof r & { choice: TobeTrigger } =>
          r.choice === "standard" || r.choice === "discuss" || r.choice === "deviate",
      )
      .map((r) => ({ questionId: r.questionId, choice: r.choice, reason: r.reason })),
    questions,
    rules: rules.map(
      (r): TobeRuleInput => ({
        id: r.id,
        questionId: r.questionId,
        scopeCode: r.scopeCode,
        trigger: r.trigger as TobeTrigger,
        state: r.state as TobeStepState,
        sscuiId: r.sscuiId,
        sscuiName: r.sscuiName,
        gapType: r.gapType ? (GAP_TYPE_FROM_DB[r.gapType] ?? null) : null,
        alternatePathId: r.alternatePathId,
        stepNames: r.stepNames,
        source: r.source,
        note: r.note,
      }),
    ),
    chains,
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    ...(opts.consultantNotes ? { consultantNotes: opts.consultantNotes } : {}),
  };
  return {
    bundle: { id: bundle.id, client: bundle.client, state: bundle.state, createdById: bundle.createdById },
    input,
  };
}

export async function generateAndSavePack(
  db: Db,
  bundleId: string,
  userId: string | null,
  opts: { generatedAt?: string } = {},
): Promise<{ pack: { id: string; generatedAt: Date }; doc: TobePackDoc } | null> {
  const loaded = await loadTobeInputs(db, bundleId, opts);
  if (!loaded) return null;
  const doc = generateTobePack(loaded.input);
  const release = await db.sapContentRelease.findFirst({
    where: { release: doc.release },
    orderBy: { loadedAt: "desc" },
    select: { id: true },
  });
  const pack = await db.tobePack.create({
    data: {
      bundleId,
      releaseId: release?.id ?? null,
      scopeCodes: loaded.input.scopeCodes,
      scopeHash: doc.hashes.scope,
      answerHash: doc.hashes.answers,
      rulesHash: doc.hashes.rules,
      inputsHash: doc.hashes.inputs,
      packJson: doc as unknown as Prisma.InputJsonValue,
      generatedById: userId,
    },
    select: { id: true, generatedAt: true },
  });
  return { pack, doc };
}

export async function latestPack(
  db: Db,
  bundleId: string,
): Promise<{ id: string; generatedAt: Date; inputsHash: string; doc: TobePackDoc } | null> {
  const row = await db.tobePack.findFirst({
    where: { bundleId },
    orderBy: { generatedAt: "desc" },
    select: { id: true, generatedAt: true, inputsHash: true, packJson: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    generatedAt: row.generatedAt,
    inputsHash: row.inputsHash,
    doc: row.packJson as unknown as TobePackDoc,
  };
}
