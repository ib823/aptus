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
}

export interface TreeSubProcess {
  id: string;
  name: string;
  type: string;
  displayOrder: number;
  scopeItems: TreeScopeItem[];
  /** True when at least one scope item carries BDC L2 coverage. */
  hasAnyBdcCoverage: boolean;
}

export interface TreeStream {
  id: string;
  name: string;
  isFoundation: boolean;
  displayOrder: number;
  subProcesses: TreeSubProcess[];
  totalScopeItems: number;
}

export async function getValueStreamTree(): Promise<TreeStream[]> {
  const streams = await prisma.affirmValueStream.findMany({
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
  });

  return streams.map((s) => ({
    id: s.id,
    name: s.name,
    isFoundation: s.isFoundation,
    displayOrder: s.displayOrder,
    totalScopeItems: s.subProcesses.reduce(
      (n, sp) => n + sp.scopeItems.length,
      0,
    ),
    subProcesses: s.subProcesses.map((sp) => ({
      id: sp.id,
      name: sp.name,
      type: sp.type,
      displayOrder: sp.displayOrder,
      scopeItems: sp.scopeItems,
      hasAnyBdcCoverage: sp.scopeItems.some((si) => si.hasBdcCoverage),
    })),
  }));
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
  sapArea: string | null;
  sapTopic: string | null;
  sscuiRef: string | null;
  scopeItemRefs: string[];
  status: string;
  flag: string | null;
  displayOrder: number;
}

export async function getAffirmSetForBundle(
  bundleId: string,
  opts: { forClient?: boolean } = {},
): Promise<AffirmQuestionRow[]> {
  const bundle = await prisma.affirmBundle.findUnique({
    where: { id: bundleId },
    include: { scopeItems: { select: { scopeItemId: true } } },
  });
  if (!bundle) return [];
  const scopeIds = bundle.scopeItems.map((s) => s.scopeItemId);

  // A question is in-scope if any of its scopeItemRefs intersects the
  // selected scope. Postgres array overlap (`&&`) is the natural operator
  // here but Prisma exposes `hasSome`.
  const where: Prisma.AffirmQuestionWhereInput = {
    scopeItemRefs: { hasSome: scopeIds.length > 0 ? scopeIds : ["__NONE__"] },
  };
  if (opts.forClient) {
    where.status = { not: "excluded" };
  }

  const rows = await prisma.affirmQuestion.findMany({
    where,
    orderBy: [{ streamId: "asc" }, { subProcessId: "asc" }, { displayOrder: "asc" }],
    include: {
      stream: { select: { name: true } },
      subProcess: { select: { name: true } },
    },
  });

  return rows.map((q) => ({
    id: q.id,
    streamId: q.streamId,
    streamName: q.stream.name,
    subProcessId: q.subProcessId,
    subProcessName: q.subProcess.name,
    sapVerbatim: q.sapVerbatim,
    plainLanguageSuggested: q.plainLanguageSuggested,
    consultantWording: q.consultantWording,
    sapArea: q.sapArea,
    sapTopic: q.sapTopic,
    sscuiRef: q.sscuiRef,
    scopeItemRefs: q.scopeItemRefs,
    status: q.status,
    flag: q.flag,
    displayOrder: q.displayOrder,
  }));
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
