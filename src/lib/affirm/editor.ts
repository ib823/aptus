/**
 * Server-side helpers for the consultant question editor (Screen 2.5).
 *
 * `materializeBundleQuestions` lazily snapshots every in-scope L2
 * question onto the bundle (idempotent upsert per row). Excluded
 * questions arrive with enabled=false; all others enabled=true. The
 * editor page calls this on each render so the consultant can edit
 * question metadata even before issuing.
 *
 * `getEditorRows` returns the join rows + question content joined into
 * a single editor row, sorted by displayOrder within sub-process,
 * grouped by sub-process for the UI.
 */
import { prisma } from "@/lib/db/prisma";

export interface EditorRow {
  // join-row fields
  bundleId: string;
  questionId: string;
  enabled: boolean;
  displayOrder: number;
  format: "decision" | "information";
  // question content (read-mostly; consultantWording, aboutText, standardMeans editable)
  streamId: string;
  streamName: string;
  subProcessId: string;
  subProcessName: string;
  sapVerbatim: string | null;
  plainLanguageSuggested: string | null;
  consultantWording: string | null;
  aboutText: string | null;
  standardMeans: string | null;
  sapArea: string | null;
  sapTopic: string | null;
  sscuiRef: string | null;
  scopeItemRefs: string[];
  status: string;
  flag: string | null;
  isCustom: boolean;
  /** True once the bundle was issued and this row carries its own copy. */
  frozen: boolean;
}

export async function materializeBundleQuestions(
  bundleId: string,
): Promise<{ created: number; total: number }> {
  const bundle = await prisma.affirmBundle.findUnique({
    where: { id: bundleId },
    include: {
      scopeItems: {
        select: { scopeItemId: true, scopeItem: { select: { streamId: true } } },
      },
    },
  });
  if (!bundle) return { created: 0, total: 0 };
  const scopeIds = bundle.scopeItems.map((s) => s.scopeItemId);
  if (scopeIds.length === 0) return { created: 0, total: 0 };
  // v2.1 data fix: 71 of 150 L2 questions have empty scopeItemRefs —
  // they're stream-level (Business Overview, MRP, etc.) and would
  // otherwise be silently dropped from every bundle. Include them
  // whenever any scope item from the same stream is selected.
  const streamIds = Array.from(
    new Set(bundle.scopeItems.map((s) => s.scopeItem.streamId)),
  );

  const questions = await prisma.affirmQuestion.findMany({
    where: {
      OR: [
        { scopeItemRefs: { hasSome: scopeIds } },
        { scopeItemRefs: { isEmpty: true }, streamId: { in: streamIds } },
      ],
    },
    select: { id: true, status: true, displayOrder: true, format: true },
  });

  const existing = await prisma.affirmBundleQuestion.findMany({
    where: { bundleId, questionId: { in: questions.map((q) => q.id) } },
    select: { questionId: true },
  });
  const existingIds = new Set(existing.map((e) => e.questionId));

  const toCreate = questions.filter((q) => !existingIds.has(q.id));
  if (toCreate.length) {
    await prisma.affirmBundleQuestion.createMany({
      data: toCreate.map((q) => ({
        bundleId,
        questionId: q.id,
        enabled: q.status !== "excluded",
        displayOrder: q.displayOrder,
        // v2.1: pick up the SAP default format from the question bank.
        // Consultant override stays on the join row.
        format: q.format,
      })),
      skipDuplicates: true,
    });
  }

  return { created: toCreate.length, total: questions.length };
}

export async function getEditorRows(bundleId: string): Promise<EditorRow[]> {
  const rows = await prisma.affirmBundleQuestion.findMany({
    where: { bundleId },
    include: {
      question: {
        include: {
          stream: { select: { id: true, name: true } },
          subProcess: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [
      { question: { subProcessId: "asc" } },
      { displayOrder: "asc" },
      { question: { displayOrder: "asc" } },
    ],
  });

  return rows.map((r) => {
    // Show the consultant exactly what the client is being shown. Once the
    // bundle is issued that is the frozen copy on the join row, not whatever
    // the shared question bank says now — otherwise this screen would report a
    // wording the client never saw. See AffirmBundleQuestion.frozenAt.
    const isFrozen = r.frozenAt != null;
    return {
    bundleId: r.bundleId,
    questionId: r.questionId,
    enabled: r.enabled,
    displayOrder: r.displayOrder,
    format: (r.format === "information" ? "information" : "decision") as
      | "decision"
      | "information",
    streamId: r.question.streamId,
    streamName: r.question.stream.name,
    subProcessId: r.question.subProcessId,
    subProcessName: r.question.subProcess.name,
    sapVerbatim: r.question.sapVerbatim,
    plainLanguageSuggested: r.question.plainLanguageSuggested,
    consultantWording: isFrozen ? r.frozenWording : r.question.consultantWording,
    aboutText: isFrozen ? r.frozenAboutText : r.question.aboutText,
    standardMeans: isFrozen ? r.frozenStandardMeans : r.question.standardMeans,
    sapArea: r.question.sapArea,
    sapTopic: r.question.sapTopic,
    sscuiRef: r.question.sscuiRef,
    scopeItemRefs: r.question.scopeItemRefs,
    status: r.question.status,
    flag: r.question.flag,
    isCustom: r.question.isCustom,
    frozen: isFrozen,
    };
  });
}
