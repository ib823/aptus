/**
 * 2608 WS6 — load the engine's inputs for one affirm bundle ("engagement") and
 * persist a generated pack. The only place the pack touches the database.
 *
 *   scope set   AffirmBundleScopeItem rows of the bundle (SAP scope codes)
 *   answers     AffirmResponse rows (standard | discuss | deviate + reason)
 *   questions   AffirmQuestion rows naming any scoped item
 *   rules       TobeRule rows for the scoped + chained items
 *   contents    WS14: the 2608 BPD data files where one exists (9 codes), the
 *               SapProcessStep master otherwise (652 more) — see step-source.ts
 *   forms       SapFormTemplate rows naming the scope item
 *   integrations ScopeItemCommScenario × SapCommScenario
 *   restrictions SapNotSupported for the engagement's country footprint
 *   chains      sap-references/2608/e2e-chains.json
 */
import type { PrismaClient, Prisma } from "@prisma/client";

import { resolveSapContentRelease } from "@/lib/sap-content/release";

import { chainsForScope } from "./chains";
import { restrictionCountryNames } from "./countries";
import { generateTobePack } from "./engine";
import { bpdContent, resolveContents } from "./step-source";
import type {
  TobeEngineInput,
  TobeForm,
  TobeGapType,
  TobeIntegration,
  TobePackDoc,
  TobeRestriction,
  TobeRuleInput,
  TobeScopeContent,
  TobeStepState,
  TobeTrigger,
} from "./types";

type Db = Pick<
  PrismaClient,
  | "affirmBundle"
  | "affirmQuestion"
  | "tobeRule"
  | "tobePack"
  | "sapContentRelease"
  | "sapProcessStep"
  | "sapFormTemplate"
  | "scopeItemCommScenario"
  | "sapCommScenario"
  | "sapNotSupported"
>;

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

/**
 * The BPD data files as engine content — value streams (O2C-SALES) are not
 * scope items. Kept as a named export because it is the BPD-only path the
 * unit tests drive; `loadTobeInputs` goes through `resolveContents`, which
 * calls this first and falls back to the process-step master.
 */
export function ftsContents(codes: string[]): Record<string, TobeScopeContent> {
  const out: Record<string, TobeScopeContent> = {};
  for (const code of codes) {
    const c = bpdContent(code);
    if (c) out[code] = c;
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
      country: true,
      countries: true,
      scopeItems: { select: { scopeItemId: true } },
      responses: { select: { questionId: true, choice: true, reason: true } },
    },
  });
  if (!bundle) return null;
  // `countries` is the footprint; `country` is the older singular field and
  // still the truth for every bundle created before WS14. Reading both means
  // an un-migrated bundle keeps working instead of silently losing its filter.
  const countries =
    bundle.countries.length > 0 ? bundle.countries : bundle.country ? [bundle.country] : [];
  const scopeCodes = bundle.scopeItems.map((s) => s.scopeItemId).sort();
  const chains = chainsForScope(scopeCodes);
  const chainCodes = chains.flatMap((c) => [...c.path, ...c.alternates.flatMap((a) => a.via)]);
  const allCodes = Array.from(new Set([...scopeCodes, ...chainCodes]));

  const release = resolveSapContentRelease().release;
  const [questions, rules, masterRows, formRows, linkRows, restrictionRows] = await Promise.all([
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
    // Ordered in SQL so the step order is the database's, not a re-sort here
    // that could disagree with what SAP published.
    db.sapProcessStep.findMany({
      where: { scopeItemCode: { in: allCodes } },
      select: {
        scopeItemCode: true,
        scopeItemName: true,
        sequence: true,
        activity: true,
        fioriAppTitle: true,
        fioriAppId: true,
        businessRoleDescription: true,
        businessRoleId: true,
        countries: true,
        isGlobal: true,
      },
      orderBy: [{ scopeItemCode: "asc" }, { sequence: "asc" }],
    }),
    db.sapFormTemplate.findMany({
      where: { scopeItemCodes: { hasSome: allCodes } },
      select: {
        name: true,
        applicationArea: true,
        applicationObject: true,
        outputType: true,
        adobeFormTemplate: true,
        scopeItemCodes: true,
      },
      orderBy: [{ applicationArea: "asc" }, { name: "asc" }],
    }),
    db.scopeItemCommScenario.findMany({
      where: { scopeItemCode: { in: allCodes } },
      select: { scopeItemCode: true, commScenarioId: true, mandatory: true, sourceUrl: true },
      orderBy: [{ scopeItemCode: "asc" }, { commScenarioId: "asc" }],
    }),
    // An unstated footprint is not a filter (see step-source.keepForCountries):
    // with no countries the pack carries the whole register and says so.
    db.sapNotSupported.findMany({
      where:
        countries.length > 0
          ? {
              // `country: null` is 264 of the 539 rows — statements SAP makes
              // about the product with no country qualifier. They apply to
              // every footprint, and an `in` list alone would drop all of
              // them, which is precisely the ones most likely to matter.
              OR: [{ country: { in: restrictionCountryNames(countries) } }, { country: null }],
            }
          : {},
      select: {
        capability: true,
        country: true,
        whatIsNotSupported: true,
        statementVerbatim: true,
        sourceUrl: true,
        futureSupportStated: true,
      },
      orderBy: [{ country: "asc" }, { capability: "asc" }, { sourceRow: "asc" }],
    }),
  ]);

  const scenarioIds = Array.from(new Set(linkRows.map((l) => l.commScenarioId)));
  const scenarios = await db.sapCommScenario.findMany({
    where: { commScenarioId: { in: scenarioIds } },
    select: {
      commScenarioId: true,
      name: true,
      direction: true,
      inboundServices: true,
      outboundServices: true,
      apiIds: true,
    },
  });
  const scenarioById = new Map(scenarios.map((s) => [s.commScenarioId, s]));

  const forms: Record<string, TobeForm[]> = {};
  for (const f of formRows) {
    const entry: TobeForm = {
      name: f.name,
      applicationArea: f.applicationArea,
      applicationObject: f.applicationObject,
      outputType: f.outputType,
      adobeFormTemplate: f.adobeFormTemplate,
    };
    // One form row names many scope items; it belongs to each of them.
    for (const code of f.scopeItemCodes) {
      if (!allCodes.includes(code)) continue;
      (forms[code] ??= []).push(entry);
    }
  }

  const integrations: Record<string, TobeIntegration[]> = {};
  for (const l of linkRows) {
    const s = scenarioById.get(l.commScenarioId);
    (integrations[l.scopeItemCode] ??= []).push({
      commScenarioId: l.commScenarioId,
      // SAP names 62 of 496 scenarios in the anonymous slice. The rest are
      // null, not "Unknown" — a placeholder would read as a published name.
      name: s?.name ?? null,
      direction: s?.direction ?? null,
      mandatory: l.mandatory,
      inboundServices: s?.inboundServices ?? [],
      outboundServices: s?.outboundServices ?? [],
      apiIds: s?.apiIds ?? [],
      sourceUrl: l.sourceUrl,
    });
  }

  const restrictions: TobeRestriction[] = restrictionRows.map((r) => ({
    capability: r.capability,
    country: r.country,
    whatIsNotSupported: r.whatIsNotSupported,
    statementVerbatim: r.statementVerbatim,
    sourceUrl: r.sourceUrl,
    futureSupportStated: r.futureSupportStated,
  }));

  const contents = resolveContents(allCodes, masterRows, release, countries);
  const input: TobeEngineInput = {
    release: releaseOf(contents),
    scopeCodes,
    contents,
    countries,
    forms,
    integrations,
    restrictions,
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
