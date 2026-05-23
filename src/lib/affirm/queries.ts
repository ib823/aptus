/**
 * Read-side helpers for the value-stream affirm-set.
 *
 * `getValueStreamTree` returns the full 3-tier tree used by Screen 1
 * (consultant scope picker). `getAffirmSetForBundle` resolves the
 * affirm-set FROM A SELECTED SCOPE — by taking the union of L2
 * questions linked to the bundle's scope items via `scopeItemRefs`,
 * with excluded questions filtered out for client-facing views.
 *
 * Coverage discipline (master prompt §5): we never hide the gap.
 * `streamCoverage` reports which selected sub-processes have an
 * affirm-set and which carry zero.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

export interface TreeScopeItem {
  id: string;
  description: string;
  sapBusinessArea: string | null;
  hasBdcCoverage: boolean;
  placementReviewFlag: string | null;
  /**
   * v2 (CCC follow-up §5): how many BDC L2 questions reference this
   * scope item. Drives the per-row coverage badge ("8 questions" /
   * "no affirm-set") in the scope picker.
   */
  questionCount: number;
}

export interface TreeSubProcess {
  id: string;
  name: string;
  type: string;
  displayOrder: number;
  scopeItems: TreeScopeItem[];
  /** True when at least one scope item carries BDC L2 coverage. */
  hasAnyBdcCoverage: boolean;
  /** v2 §5: rolled-up sum of per-scope-item question counts. */
  questionCount: number;
}

export interface TreeStream {
  id: string;
  name: string;
  isFoundation: boolean;
  displayOrder: number;
  subProcesses: TreeSubProcess[];
  totalScopeItems: number;
  /** v2 §5: rolled-up sum of per-sub-process question counts. */
  questionCount: number;
}

export async function getValueStreamTree(): Promise<TreeStream[]> {
  // Pull the tree and the question set together. Questions tag scope
  // items via scopeItemRefs (an array column); a single question can
  // touch multiple scope items.
  const [streams, questions] = await Promise.all([
    prisma.affirmValueStream.findMany({
      orderBy: { displayOrder: "asc" },
      include: {
        subProcesses: {
          orderBy: { displayOrder: "asc" },
          include: {
            scopeItems: {
              orderBy: { id: "asc" },
              select: {
                id: true,
                description: true,
                sapBusinessArea: true,
                hasBdcCoverage: true,
                placementReviewFlag: true,
              },
            },
          },
        },
      },
    }),
    prisma.affirmQuestion.findMany({
      where: { status: { not: "excluded" } },
      select: { scopeItemRefs: true },
    }),
  ]);

  // Build the per-scope-item question count by walking each question's
  // refs once. O(questions * avg refs per question) — ~150 * ~3 = 450.
  const perItem = new Map<string, number>();
  for (const q of questions) {
    for (const ref of q.scopeItemRefs) {
      perItem.set(ref, (perItem.get(ref) ?? 0) + 1);
    }
  }

  return streams.map((s) => {
    const subProcesses = s.subProcesses.map((sp) => {
      const scopeItems = sp.scopeItems.map((si) => ({
        ...si,
        questionCount: perItem.get(si.id) ?? 0,
      }));
      return {
        id: sp.id,
        name: sp.name,
        type: sp.type,
        displayOrder: sp.displayOrder,
        scopeItems,
        hasAnyBdcCoverage: scopeItems.some((si) => si.hasBdcCoverage),
        questionCount: scopeItems.reduce((n, si) => n + si.questionCount, 0),
      };
    });
    return {
      id: s.id,
      name: s.name,
      isFoundation: s.isFoundation,
      displayOrder: s.displayOrder,
      totalScopeItems: subProcesses.reduce((n, sp) => n + sp.scopeItems.length, 0),
      questionCount: subProcesses.reduce((n, sp) => n + sp.questionCount, 0),
      subProcesses,
    };
  });
}

/**
 * Resolve the L2 affirm-set for a bundle's scope. A question is in-scope
 * when its `scopeItemRefs` array intersects the bundle's selected scope
 * codes. Excluded questions are returned only for the consultant view so
 * Screen 3 can show the "15 hidden — never client-facing" line; the
 * client-facing query (`forClient=true`) drops them.
 */
export interface AffirmQuestionRow {
  id: string;
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
  displayOrder: number;
  isCustom: boolean;
  // v2 §8: per-bundle join-row fields. When the bundle has not yet
  // materialised join rows (pre-editor visit), these fall back to
  // sensible defaults: format=decision, enabled=true.
  format: "decision" | "information";
  enabled: boolean;
}

export async function getAffirmSetForBundle(
  bundleId: string,
  opts: { forClient?: boolean } = {},
): Promise<AffirmQuestionRow[]> {
  const bundle = await prisma.affirmBundle.findUnique({
    where: { id: bundleId },
    include: {
      scopeItems: { select: { scopeItemId: true } },
      questions: {
        select: {
          questionId: true,
          enabled: true,
          displayOrder: true,
          format: true,
        },
      },
    },
  });
  if (!bundle) return [];
  const scopeIds = bundle.scopeItems.map((s) => s.scopeItemId);

  // A question is in-scope if any of its scopeItemRefs intersects the
  // selected scope. The bundle.questions join already snapshots
  // post-issue; we union both sources to handle the pre-issue editor
  // case as well as custom questions (which have empty scopeItemRefs).
  const scopeWhere: Prisma.AffirmQuestionWhereInput[] = [];
  if (scopeIds.length > 0) {
    scopeWhere.push({ scopeItemRefs: { hasSome: scopeIds } });
  }
  const snapshotIds = bundle.questions.map((q) => q.questionId);
  if (snapshotIds.length > 0) {
    scopeWhere.push({ id: { in: snapshotIds } });
  }
  if (scopeWhere.length === 0) return [];

  const where: Prisma.AffirmQuestionWhereInput = {
    OR: scopeWhere,
  };

  const rows = await prisma.affirmQuestion.findMany({
    where,
    orderBy: [{ streamId: "asc" }, { subProcessId: "asc" }, { displayOrder: "asc" }],
    include: {
      stream: { select: { name: true } },
      subProcess: { select: { name: true } },
    },
  });

  // Build the join-row index so we can attach per-bundle values.
  const joinByQid = new Map(bundle.questions.map((bq) => [bq.questionId, bq]));

  let mapped: AffirmQuestionRow[] = rows.map((q) => {
    const bq = joinByQid.get(q.id);
    return {
      id: q.id,
      streamId: q.streamId,
      streamName: q.stream.name,
      subProcessId: q.subProcessId,
      subProcessName: q.subProcess.name,
      sapVerbatim: q.sapVerbatim,
      plainLanguageSuggested: q.plainLanguageSuggested,
      consultantWording: q.consultantWording,
      aboutText: q.aboutText,
      standardMeans: q.standardMeans,
      sapArea: q.sapArea,
      sapTopic: q.sapTopic,
      sscuiRef: q.sscuiRef,
      scopeItemRefs: q.scopeItemRefs,
      status: q.status,
      flag: q.flag,
      displayOrder: bq?.displayOrder ?? q.displayOrder,
      isCustom: q.isCustom,
      format: (bq?.format === "information" ? "information" : "decision") as
        | "decision"
        | "information",
      enabled: bq?.enabled ?? q.status !== "excluded",
    };
  });

  if (opts.forClient) {
    // v2 §4: excluded rows are pre-disabled at issue; we belt-and-braces
    // here so any stale join-row that wasn't marked disabled is still
    // hidden from the client. enabled=false short-circuits everything.
    mapped = mapped.filter((q) => q.enabled && q.status !== "excluded");
  }

  // Final sort: respect per-bundle displayOrder when present.
  mapped.sort((a, b) => {
    if (a.subProcessId !== b.subProcessId) {
      return a.subProcessId.localeCompare(b.subProcessId);
    }
    return a.displayOrder - b.displayOrder;
  });

  return mapped;
}

/**
 * Coverage report for a bundle's selected scope — used by Screen 1 to
 * surface sub-processes that carry no affirm-set, and by Screen 3 to
 * explain "5 of your 12 sub-processes carry questions; the other 7
 * have no L2 affirm-set in the SAP source."
 */
export interface CoverageReport {
  totalScopeItems: number;
  itemsWithBdc: number;
  itemsWithoutBdc: number;
  pendingCuration: number;
  subProcessGroups: Array<{
    subProcessId: string;
    subProcessName: string;
    streamId: string;
    streamName: string;
    selectedCount: number;
    coveredCount: number;
  }>;
}

export async function getCoverageForBundle(
  bundleId: string,
): Promise<CoverageReport> {
  const rows = await prisma.affirmBundleScopeItem.findMany({
    where: { bundleId },
    include: {
      scopeItem: {
        include: {
          stream: { select: { id: true, name: true } },
          subProcess: { select: { id: true, name: true } },
        },
      },
    },
  });

  const groups = new Map<string, CoverageReport["subProcessGroups"][number]>();
  let itemsWithBdc = 0;
  let pendingCuration = 0;

  for (const r of rows) {
    if (r.scopeItem.hasBdcCoverage) itemsWithBdc++;
    if (r.scopeItem.placementReviewFlag) pendingCuration++;
    const key = r.scopeItem.subProcessId;
    const g = groups.get(key) ?? {
      subProcessId: r.scopeItem.subProcessId,
      subProcessName: r.scopeItem.subProcess.name,
      streamId: r.scopeItem.streamId,
      streamName: r.scopeItem.stream.name,
      selectedCount: 0,
      coveredCount: 0,
    };
    g.selectedCount++;
    if (r.scopeItem.hasBdcCoverage) g.coveredCount++;
    groups.set(key, g);
  }

  return {
    totalScopeItems: rows.length,
    itemsWithBdc,
    itemsWithoutBdc: rows.length - itemsWithBdc,
    pendingCuration,
    subProcessGroups: Array.from(groups.values()).sort((a, b) =>
      a.streamName.localeCompare(b.streamName) ||
      a.subProcessName.localeCompare(b.subProcessName)
        ? a.streamName.localeCompare(b.streamName) ||
          a.subProcessName.localeCompare(b.subProcessName)
        : 0,
    ),
  };
}
