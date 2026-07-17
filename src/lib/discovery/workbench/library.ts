/**
 * ABeam Workbench — Neutral Process Discovery consultant library queries.
 *
 * ⚠ CONSULTANT-ONLY. This module reads the consultant dataset (origin, APQC,
 * provenance, the 18 parked vendor enablers) and is therefore unreachable from
 * any (external) module — the dependency-boundary test proves it transitively
 * from every client entry point.
 *
 * The library itself is READ-ONLY here and stays that way until PR-6's P4
 * capture pipeline. Everything below is projection, not mutation.
 */

import {
  allConsultantProcessesWithCompleteness,
  consultantValueStreams,
  loadConsultantLibrary,
  type ConsultantProcessWithCompleteness,
} from "@/lib/discovery/consultant-library";
import type { Completeness, Tier } from "@/lib/discovery/schema";

/**
 * P4 §4 adds a third origin. `client-captured` entries do NOT live in the
 * committed JSON — it stays byte-frozen and hash-pinned. They live in
 * DiscoveryPromotedEntry, and the library views COMPOSE the two. Folding them
 * into the JSON is the post-pilot re-emission's job, upstream.
 */
export type Origin = "sap-base" | "overlay" | "client-captured";

export const ORIGIN_LABELS: Record<Origin, string> = {
  "sap-base": "Base",
  overlay: "Overlay",
  "client-captured": "Client-captured",
};

/**
 * One row of the C2 grid — flattened, with its stream/workflow context.
 *
 * `origin` is widened past the dataset's own union: the committed JSON only ever
 * carries sap-base | overlay, but the composed view also holds client-captured
 * rows that come from DiscoveryPromotedEntry, not the JSON.
 */
export interface LibraryRow extends Omit<ConsultantProcessWithCompleteness, "origin"> {
  origin: Origin;
  streamId: string;
  streamName: string;
  workflowName: string;
  apqcCode: string | null;
  apqcCategory: string | null;
  mainSteps: number;
  subSteps: number;
  hasFlow: boolean;
}

let rowCache: LibraryRow[] | null = null;

export function libraryRows(): LibraryRow[] {
  if (rowCache) return rowCache;
  const byId = new Map(allConsultantProcessesWithCompleteness().map((p) => [p.scope_id, p]));
  const out: LibraryRow[] = [];
  for (const vs of consultantValueStreams()) {
    for (const wf of vs.workflows) {
      for (const p of wf.processes) {
        const withCompleteness = byId.get(p.scope_id);
        const flow = p.flow ?? [];
        out.push({
          ...p,
          completeness: withCompleteness?.completeness ?? null,
          streamId: vs.id,
          streamName: vs.name,
          workflowName: wf.name,
          apqcCode: p.apqc?.code ?? null,
          apqcCategory: p.apqc?.category ?? null,
          mainSteps: flow.length,
          subSteps: flow.reduce((n, s) => n + (s.substeps?.length ?? 0), 0),
          hasFlow: flow.length > 0,
        });
      }
    }
  }
  rowCache = out;
  return out;
}

// ─── Facets (C2) ─────────────────────────────────────────────────────────────

export interface LibraryFacets {
  streams: Array<{ id: string; name: string; count: number }>;
  workflows: Array<{ name: string; count: number }>;
  apqc: Array<{ code: string; category: string; count: number }>;
  completeness: Array<{ value: Completeness | "none"; count: number }>;
  tiers: Array<{ value: Tier; count: number }>;
  industries: Array<{ value: string; count: number }>;
  origins: Array<{ value: Origin; count: number }>;
  hasFlow: { yes: number; no: number };
}

function tally<T extends string>(xs: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

export function libraryFacets(): LibraryFacets {
  const rows = libraryRows();
  const streamCounts = tally(rows.map((r) => r.streamId));
  const streamNames = new Map(consultantValueStreams().map((vs) => [vs.id, vs.name]));

  const apqcCounts = new Map<string, { category: string; count: number }>();
  for (const r of rows) {
    if (!r.apqcCode) continue;
    const cur = apqcCounts.get(r.apqcCode);
    if (cur) cur.count += 1;
    else apqcCounts.set(r.apqcCode, { category: r.apqcCategory ?? "", count: 1 });
  }

  return {
    streams: [...streamCounts].map(([id, count]) => ({
      id,
      name: streamNames.get(id) ?? id,
      count,
    })),
    workflows: [...tally(rows.map((r) => r.workflowName))].map(([name, count]) => ({
      name,
      count,
    })),
    apqc: [...apqcCounts]
      .map(([code, v]) => ({ code, category: v.category, count: v.count }))
      .sort((a, b) => Number(a.code) - Number(b.code)),
    completeness: [...tally(rows.map((r) => r.completeness ?? ("none" as const)))].map(
      ([value, count]) => ({ value, count }),
    ),
    tiers: [...tally(rows.map((r) => r.tier))].map(([value, count]) => ({ value, count })),
    industries: [...tally(rows.filter((r) => r.industry).map((r) => r.industry!))]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value)),
    origins: [...tally(rows.map((r) => r.origin))].map(([value, count]) => ({ value, count })),
    hasFlow: {
      yes: rows.filter((r) => r.hasFlow).length,
      no: rows.filter((r) => !r.hasFlow).length,
    },
  };
}

// ─── Filtering + sorting (C2) ────────────────────────────────────────────────

export interface LibraryQuery {
  q?: string;
  stream?: string;
  workflow?: string;
  apqc?: string;
  completeness?: string;
  tier?: string;
  industry?: string;
  origin?: string;
  hasFlow?: "yes" | "no";
  sort?: LibrarySortKey;
  dir?: "asc" | "desc";
}

export type LibrarySortKey = "id" | "name" | "stream" | "workflow" | "apqc" | "completeness" | "steps" | "origin";

/** Ordered worst→best so a "completeness" sort surfaces the thin records first. */
const COMPLETENESS_RANK: Record<string, number> = {
  none: 0,
  outline: 1,
  detailed: 2,
  "detailed+variants": 3,
};

export function queryLibrary(q: LibraryQuery): LibraryRow[] {
  let rows = libraryRows();

  if (q.stream) rows = rows.filter((r) => r.streamId === q.stream);
  if (q.workflow) rows = rows.filter((r) => r.workflowName === q.workflow);
  if (q.apqc) rows = rows.filter((r) => r.apqcCode === q.apqc);
  if (q.completeness) {
    rows = rows.filter((r) => (r.completeness ?? "none") === q.completeness);
  }
  if (q.tier) rows = rows.filter((r) => r.tier === q.tier);
  if (q.industry) rows = rows.filter((r) => r.industry === q.industry);
  if (q.origin) rows = rows.filter((r) => r.origin === q.origin);
  if (q.hasFlow) rows = rows.filter((r) => (q.hasFlow === "yes" ? r.hasFlow : !r.hasFlow));

  const needle = q.q?.trim().toLowerCase();
  if (needle) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.scope_id.toLowerCase().includes(needle) ||
        r.description.toLowerCase().includes(needle),
    );
  }

  const key = q.sort ?? "id";
  const dir = q.dir === "desc" ? -1 : 1;
  const cmp = (a: LibraryRow, b: LibraryRow): number => {
    switch (key) {
      case "name":
        return a.name.localeCompare(b.name);
      case "stream":
        return a.streamName.localeCompare(b.streamName);
      case "workflow":
        return a.workflowName.localeCompare(b.workflowName);
      case "apqc":
        return Number(a.apqcCode ?? 99) - Number(b.apqcCode ?? 99);
      case "completeness":
        return (
          (COMPLETENESS_RANK[a.completeness ?? "none"] ?? 0) -
          (COMPLETENESS_RANK[b.completeness ?? "none"] ?? 0)
        );
      case "steps":
        return a.mainSteps + a.subSteps - (b.mainSteps + b.subSteps);
      case "origin":
        return a.origin.localeCompare(b.origin);
      case "id":
      default:
        return a.scope_id.localeCompare(b.scope_id);
    }
  };
  // Stable secondary sort on id, so equal keys don't reshuffle between renders.
  return [...rows].sort((a, b) => cmp(a, b) * dir || a.scope_id.localeCompare(b.scope_id));
}

export function findLibraryRow(scopeId: string): LibraryRow | null {
  return libraryRows().find((r) => r.scope_id === scopeId) ?? null;
}

/**
 * The composed view: committed JSON + promoted entries, badged.
 *
 * Only SHARED-visible promotions compose in (P4 §5.3): a sensitive pattern
 * observed at one client stays in the internal register, so it must not appear
 * in a view a consultant could screen-share or export.
 */
export interface ComposedLibrary {
  rows: LibraryRow[];
  promotedCount: number;
  registerOnlyCount: number;
}

export function composeLibrary(promoted: PromotedComposable[]): ComposedLibrary {
  const shared = promoted.filter((p) => p.sharedVisible);
  const rows: LibraryRow[] = shared.map((p) => {
    const parent = p.linkedProcessId ? findLibraryRow(p.linkedProcessId) : null;
    return {
      scope_id: p.scopeId,
      name: p.name,
      description: p.description,
      tier: "generalized",
      industry: p.observedIndustry,
      origin: "client-captured",
      completeness: null,
      flow: undefined,
      provenance: null,
      apqc: parent?.apqc ?? null,
      // A variant inherits its parent's placement; a net-new CC### process has
      // no parent, and saying "Unplaced" is more honest than inventing a home.
      streamId: parent?.streamId ?? "",
      streamName: parent?.streamName ?? "Unplaced",
      workflowName: parent?.workflowName ?? "Client-captured",
      apqcCode: parent?.apqcCode ?? null,
      apqcCategory: parent?.apqcCategory ?? null,
      mainSteps: 0,
      subSteps: 0,
      hasFlow: false,
    } as LibraryRow;
  });
  return {
    rows: [...libraryRows(), ...rows],
    promotedCount: shared.length,
    registerOnlyCount: promoted.length - shared.length,
  };
}

export interface PromotedComposable {
  scopeId: string;
  name: string;
  description: string;
  linkedProcessId: string | null;
  observedIndustry: string;
  sharedVisible: boolean;
}

// ─── APQC coverage (C4) ──────────────────────────────────────────────────────

/**
 * Brief §6B.5 names FIVE levels. The .dc styles only three and collapses
 * Minimal and None into one grey fallback (conflict #13) — brief wins.
 */
export type CoverageLevel = "strong" | "partial" | "thin" | "minimal" | "none";

export const COVERAGE_LEVEL_LABELS: Record<CoverageLevel, string> = {
  strong: "Strong",
  partial: "Partial",
  thin: "Thin",
  minimal: "Minimal",
  none: "None",
};

/** Thin, Minimal and None are the gap register's population (§6B.6). */
export function isGapLevel(level: CoverageLevel): boolean {
  return level === "thin" || level === "minimal" || level === "none";
}

export interface ApqcCategoryCoverage {
  code: string;
  category: string;
  total: number;
  withFlow: number;
  detailed: number;
  outline: number;
  none: number;
  /** Share of the category's processes carrying a real flow, 0–1. */
  flowShare: number;
  level: CoverageLevel;
}

/**
 * Coverage level from the share of the category's processes that carry a REAL
 * flow.
 *
 * Derived from flow presence, not process count, on purpose: 253 processes with
 * no flows is a list, not coverage. Post-D6 this reads the honest 545, never the
 * sentinel-inflated 726.
 *
 * D14 — this is also why the register is COMPUTED and `meta.apqc_coverage` is
 * never read. That block still claims seven gap categories from a 654-process
 * snapshot; the 88-process overlay filled every one of them. Trusting it would
 * print seven false gaps and hide the two real ones.
 */
function levelFor(withFlow: number, total: number): CoverageLevel {
  if (total === 0) return "none";
  const share = withFlow / total;
  if (share >= 0.75) return "strong";
  if (share >= 0.5) return "partial";
  if (share >= 0.25) return "thin";
  if (share > 0) return "minimal";
  return "none";
}

export function apqcCoverage(): ApqcCategoryCoverage[] {
  const rows = libraryRows();
  const byCode = new Map<string, ApqcCategoryCoverage>();

  for (const r of rows) {
    if (!r.apqcCode) continue;
    let c = byCode.get(r.apqcCode);
    if (!c) {
      c = {
        code: r.apqcCode,
        category: r.apqcCategory ?? "",
        total: 0,
        withFlow: 0,
        detailed: 0,
        outline: 0,
        none: 0,
        flowShare: 0,
        level: "none",
      };
      byCode.set(r.apqcCode, c);
    }
    c.total += 1;
    if (r.hasFlow) c.withFlow += 1;
    if (r.completeness === "detailed" || r.completeness === "detailed+variants") c.detailed += 1;
    else if (r.completeness === "outline") c.outline += 1;
    else c.none += 1;
  }

  const out = [...byCode.values()].sort((a, b) => Number(a.code) - Number(b.code));
  for (const c of out) {
    c.flowShare = c.total > 0 ? c.withFlow / c.total : 0;
    c.level = levelFor(c.withFlow, c.total);
  }
  return out;
}

/**
 * The gap register's derived population: every category whose coverage is thin,
 * minimal or none, worst first.
 *
 * D14 — DERIVED, never `meta.gaps`. Today this returns 11.0 and 13.0. It will
 * return something different after the next re-emission, and that is the point:
 * a hardcoded list would still be claiming the overlay never happened.
 */
export function derivedGapCategories(): ApqcCategoryCoverage[] {
  return apqcCoverage()
    .filter((c) => isGapLevel(c.level))
    .sort((a, b) => a.flowShare - b.flowShare);
}

// ─── Parked enablers (consultant-only) ───────────────────────────────────────

export function parkedEnablers(): unknown[] {
  return loadConsultantLibrary().parked;
}
