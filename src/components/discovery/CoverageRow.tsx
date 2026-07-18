/**
 * ABeam Workbench — Neutral Process Discovery coverage chip row (brief §6/26).
 *
 * "Three stat tiles: '654 processes', '638 with flows', '60 industry-specific'
 * — the credibility line, muted, factual."
 *
 * The brief's first two figures are pre-overlay (654/638) and the .dc hardcodes
 * a different third tile entirely ("55 workflows · 8 value streams"). Both are
 * prototype-era snapshots. The numbers here come from `coverageCounts()`, which
 * computes from the frozen dataset: 742 / 545 / 60. The third figure — 60
 * industry-specific — matches the brief exactly; the first two are the brief's
 * own numbers brought up to date.
 *
 * This is the tile that would have read 726 before D6. It is a coverage CLAIM
 * made to a client, so it reads from the loader and nowhere else: not `meta`,
 * not MANIFEST (an integrity anchor, not a display source), and never a literal.
 */

import type { CoverageCounts } from "@/lib/discovery/client-library";

export interface CoverageRowProps {
  coverage: CoverageCounts;
}

export function CoverageRow({ coverage }: CoverageRowProps) {
  const tiles: Array<{ value: number; label: string; tone: string }> = [
    { value: coverage.processes, label: "business processes", tone: "text-navy" },
    { value: coverage.withFlow, label: "with a step flow", tone: "text-decision-standard" },
    { value: coverage.industrySpecific, label: "industry-specific", tone: "text-navy" },
  ];

  return (
    <ul className="mb-9 grid gap-4 sm:grid-cols-3">
      {tiles.map((t) => (
        <li
          key={t.label}
          className="rounded-card-warm border border-border-default bg-paper px-[22px] py-5 shadow-card-warm"
        >
          <p className={`font-serif text-[28px] font-medium leading-none ${t.tone}`}>
            {t.value.toLocaleString("en")}
          </p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
            {t.label}
          </p>
        </li>
      ))}
    </ul>
  );
}
