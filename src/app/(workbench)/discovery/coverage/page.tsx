/**
 * C4 · Coverage & gaps — /discovery/coverage.
 *
 * The matrix and the register are BOTH computed from live data (D14). The .dc
 * hardcodes a 7-code gap set drawn from meta.apqc_coverage, a 654-process
 * snapshot; the 88-process overlay has since filled every one of those seven.
 * Shipping it would caption "The 7 thin/minimal/none categories" over data
 * proving all seven are well covered, while hiding the two that are thin.
 *
 * Coverage is FLOW SHARE, not process count, and the caption says so — a
 * category with 253 processes and no flows is a list, not coverage.
 */

import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { GapRegister } from "@/components/discovery/workbench/GapRegister";
import { WorkbenchView } from "@/components/discovery/workbench/WorkbenchView";
import {
  COVERAGE_LEVEL_LABELS,
  apqcCoverage,
  derivedGapCategories,
  type CoverageLevel,
} from "@/lib/discovery/workbench/library";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Coverage & gaps" };

const LEVEL_CLASS: Record<CoverageLevel, string> = {
  strong: "bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)] text-decision-standard",
  partial: "bg-[color-mix(in_srgb,var(--decision-configure)_15%,transparent)] text-decision-configure",
  thin: "bg-[color-mix(in_srgb,var(--decision-custom)_15%,transparent)] text-decision-custom",
  // Minimal and None get their own treatment — the .dc collapses both into one
  // grey fallback (conflict #13), which makes "a few flows" look like "none".
  minimal: "bg-status-expired-bg text-status-expired-fg",
  none: "bg-status-revoked-bg text-status-revoked-fg",
};

export default async function CoveragePage() {
  const coverage = apqcCoverage();
  const gaps = derivedGapCategories();
  const stored = await prisma.discoveryGap.findMany();

  return (
    <WorkbenchView
      breadcrumb="Coverage & gaps"
      title="APQC coverage matrix"
      caption={`${coverage.length} categories · coverage is the share of a category's processes that carry a real step flow, not how many processes it has.`}
    >
      <div className="mb-7 overflow-auto rounded-input border border-border-default bg-paper">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <caption className="sr-only">
            APQC coverage by category. Coverage level is derived from the share of processes
            carrying a real step flow.
          </caption>
          <thead className="bg-ink-tint">
            <tr>
              {["Code", "Category", "Processes", "With a flow", "Coverage", "Detail held"].map((h) => (
                <th key={h} scope="col" className="border-b border-border-default px-3.5 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.05em] text-ink-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coverage.map((c) => (
              <tr key={c.code} className="border-b border-ink-tint hover:bg-navy-soft">
                <th scope="row" className="px-3.5 py-3 font-mono text-[11px] font-bold text-navy">{c.code}</th>
                <td className="px-3.5 py-3 text-xs text-ink">{c.category}</td>
                <td className="px-3.5 py-3 font-mono text-xs text-ink-soft">{c.total}</td>
                <td className="px-3.5 py-3 font-mono text-xs text-ink-soft">
                  {c.withFlow} <span className="text-ink-muted">({Math.round(c.flowShare * 100)}%)</span>
                </td>
                <td className="px-3.5 py-3">
                  <span className={`inline-flex h-5 items-center rounded-pill px-2 text-[10px] font-bold uppercase ${LEVEL_CLASS[c.level]}`}>
                    {COVERAGE_LEVEL_LABELS[c.level]}
                  </span>
                </td>
                <td className="px-3.5 py-3 text-[11px] text-ink-muted">
                  {c.detailed} detailed · {c.outline} outline · {c.none} no flow
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-1 font-serif text-base font-medium text-navy">Gap register</h2>
      <p className="mb-3.5 text-xs text-ink-muted">
        {gaps.length === 0
          ? "No category is thin, minimal or unmapped — every APQC category carries flows for most of its processes."
          : `${gaps.length} ${gaps.length === 1 ? "category" : "categories"} below 50% flow coverage, worst first. Derived from the library on every load, not a fixed list.`}
      </p>

      <GapRegister gaps={gaps} stored={stored.map((g) => ({ id: g.id, apqcCode: g.apqcCode, fillSource: g.fillSource, status: g.status, note: g.note }))} />
    </WorkbenchView>
  );
}
