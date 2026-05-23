/**
 * Idempotent seeder for the value-stream affirm-set.
 *
 * Loads prisma/seeds/value-stream/dataset.json (extracted from the four
 * input spreadsheets by scripts/extract-value-stream-data.py) into the
 * Affirm* models. Designed to be re-runnable: every row is `upsert`ed by
 * its natural primary key.
 *
 * The dataset asserts these counts at extraction time:
 *   8 streams (incl. Foundation), 55 sub-processes, 672 scope items,
 *   150 L2 questions (122 suggested + 13 flagged + 15 excluded),
 *   63 curation-review placements.
 *
 * The seeder verifies the same counts after upsert and throws on drift.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type ValueStream = {
  id: string;
  name: string;
  isFoundation: boolean;
  displayOrder: number;
};

type SubProcess = {
  id: string;
  streamId: string;
  name: string;
  type: string;
  displayOrder: number;
};

type ScopeItem = {
  id: string;
  subProcessId: string;
  streamId: string;
  description: string;
  sapBusinessArea: string | null;
  hasBdcCoverage: boolean;
  placementReviewFlag: string | null;
};

type AffirmQuestionSeed = {
  id: string;
  streamId: string;
  subProcessId: string;
  scopeItemRefs: string[];
  sapVerbatim: string | null;
  plainLanguageSuggested: string | null;
  consultantWording: string | null;
  sapArea: string | null;
  sapTopic: string | null;
  sscuiRef: string | null;
  sourceQuestionnaire: string | null;
  placementBasis: string | null;
  status: "suggested" | "confirmed" | "excluded";
  flag: string | null;
  statusNote: string | null;
  displayOrder: number;
  // v2.1: seeded from Standard-Answer-Layer.xlsx.
  aboutText?: string | null;
  format?: "decision" | "information";
};

type Dataset = {
  meta: { counts: Record<string, number> };
  valueStreams: ValueStream[];
  subProcesses: SubProcess[];
  scopeItems: ScopeItem[];
  questions: AffirmQuestionSeed[];
};

export type ValueStreamSeedResult = {
  streams: number;
  subProcesses: number;
  scopeItems: number;
  questions: number;
  excluded: number;
  flagged: number;
};

const DATASET_PATH = path.join(__dirname, "dataset.json");

export async function seedValueStream(
  prisma: PrismaClient,
): Promise<ValueStreamSeedResult> {
  const raw = await readFile(DATASET_PATH, "utf-8");
  const data = JSON.parse(raw) as Dataset;

  // ── Streams ────────────────────────────────────────────────────────
  for (const s of data.valueStreams) {
    await prisma.affirmValueStream.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        isFoundation: s.isFoundation,
        displayOrder: s.displayOrder,
      },
      create: s,
    });
  }

  // ── Sub-processes ──────────────────────────────────────────────────
  for (const sp of data.subProcesses) {
    await prisma.affirmSubProcess.upsert({
      where: { id: sp.id },
      update: {
        streamId: sp.streamId,
        name: sp.name,
        type: sp.type,
        displayOrder: sp.displayOrder,
      },
      create: sp,
    });
  }

  // ── Scope items ────────────────────────────────────────────────────
  // Bulk via createMany would be faster, but a re-run would conflict on
  // primary keys. We accept the per-row roundtrip in exchange for
  // idempotency; 672 rows is a sub-second seed against a local DB.
  for (const si of data.scopeItems) {
    await prisma.affirmScopeItem.upsert({
      where: { id: si.id },
      update: {
        subProcessId: si.subProcessId,
        streamId: si.streamId,
        description: si.description,
        sapBusinessArea: si.sapBusinessArea,
        hasBdcCoverage: si.hasBdcCoverage,
        placementReviewFlag: si.placementReviewFlag,
      },
      create: si,
    });
  }

  // ── L2 affirm questions ────────────────────────────────────────────
  for (const q of data.questions) {
    await prisma.affirmQuestion.upsert({
      where: { id: q.id },
      update: {
        streamId: q.streamId,
        subProcessId: q.subProcessId,
        scopeItemRefs: q.scopeItemRefs,
        sapVerbatim: q.sapVerbatim,
        plainLanguageSuggested: q.plainLanguageSuggested,
        consultantWording: q.consultantWording,
        sapArea: q.sapArea,
        sapTopic: q.sapTopic,
        sscuiRef: q.sscuiRef,
        sourceQuestionnaire: q.sourceQuestionnaire,
        placementBasis: q.placementBasis,
        status: q.status,
        flag: q.flag,
        statusNote: q.statusNote,
        displayOrder: q.displayOrder,
        // v2.1 (Standard-Answer-Layer):
        aboutText: q.aboutText ?? null,
        format: q.format ?? "decision",
      },
      create: {
        id: q.id,
        streamId: q.streamId,
        subProcessId: q.subProcessId,
        scopeItemRefs: q.scopeItemRefs,
        sapVerbatim: q.sapVerbatim,
        plainLanguageSuggested: q.plainLanguageSuggested,
        consultantWording: q.consultantWording,
        sapArea: q.sapArea,
        sapTopic: q.sapTopic,
        sscuiRef: q.sscuiRef,
        sourceQuestionnaire: q.sourceQuestionnaire,
        placementBasis: q.placementBasis,
        status: q.status,
        flag: q.flag,
        statusNote: q.statusNote,
        displayOrder: q.displayOrder,
        aboutText: q.aboutText ?? null,
        format: q.format ?? "decision",
      },
    });
  }

  // ── Verification — guard against drift ─────────────────────────────
  const [streams, subs, items, questions, excluded, flagged] = await Promise.all([
    prisma.affirmValueStream.count(),
    prisma.affirmSubProcess.count(),
    prisma.affirmScopeItem.count(),
    prisma.affirmQuestion.count(),
    prisma.affirmQuestion.count({ where: { status: "excluded" } }),
    prisma.affirmQuestion.count({ where: { flag: "config-how-to" } }),
  ]);

  const expected = data.meta.counts;
  const observed = {
    streams,
    subProcesses: subs,
    scopeItems: items,
    questions,
    questionsExcluded: excluded,
    questionsFlaggedConfigHowTo: flagged,
  };
  for (const [k, v] of Object.entries(observed)) {
    if (expected[k] !== undefined && expected[k] !== v) {
      throw new Error(
        `[seed] value-stream count drift on ${k}: expected ${expected[k]}, got ${v}`,
      );
    }
  }

  return {
    streams,
    subProcesses: subs,
    scopeItems: items,
    questions,
    excluded,
    flagged,
  };
}
