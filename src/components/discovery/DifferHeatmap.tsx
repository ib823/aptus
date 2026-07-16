/**
 * ABeam Workbench — "Where we differ" heatmap (brief §6/25).
 *
 * "A compact grid: rows = value streams, cells = workflows, cell fill =
 * dominant fit state (teal/amber/blue/gray at 15%). Hover/tap → count.
 * One-glance answer to 'where is this client non-standard?' Print-safe via
 * label+pattern."
 *
 * Departures from the .dc, brief wins:
 *  - The .dc fills cells at 100% with white text; the brief says 15%. Built at
 *    15% via color-mix against the token.
 *  - The .dc exposes the count via a `title=` attribute only, which is
 *    hover-only and therefore invisible to touch and to keyboard. The brief says
 *    "hover/tap". Each cell is a real <button> with the count in its accessible
 *    name, so it works by tap, hover and keyboard alike.
 *  - The .dc truncates the label to the workflow's first word ("Invoice",
 *    "Central"), which is ambiguous across 85 workflows. Full name, truncated
 *    visually with the full text still in the accessible name.
 *
 * Print-safe label+pattern is an Export concern (PR-3); this component carries
 * the label, which is the half that matters on screen. Never colour alone.
 */

"use client";

import { useState } from "react";
import { FIT_LABELS, type FitState } from "@/lib/discovery/fit";
import type { DiscoveryStreamSummary } from "@/lib/discovery/external/journey";

/** 15% fills per brief §6/25 — color-mix against the token, never a new hex. */
const CELL_CLASS: Record<FitState, string> = {
  standard: "bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)] text-decision-standard",
  differ: "bg-[color-mix(in_srgb,var(--decision-custom)_15%,transparent)] text-decision-custom",
  discuss: "bg-[color-mix(in_srgb,var(--decision-configure)_15%,transparent)] text-decision-configure",
  na: "bg-[color-mix(in_srgb,var(--decision-open)_15%,transparent)] text-ink-soft",
  open: "bg-ink-tint text-ink-disabled",
};

export interface DifferHeatmapProps {
  streams: DiscoveryStreamSummary[];
}

export function DifferHeatmap({ streams }: DifferHeatmapProps) {
  const [active, setActive] = useState<string | null>(null);

  return (
    <div className="mb-9 rounded-card-warm border border-border-default bg-paper px-5 py-[18px]">
      <ul>
        {streams.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center gap-3 border-b border-ink-tint py-[7px] last:border-b-0 sm:flex-nowrap"
          >
            <span className="w-[170px] shrink-0 text-xs font-semibold text-ink">{s.name}</span>
            <span className="flex flex-1 flex-wrap gap-1">
              {s.workflows.map((wf) => {
                const key = `${s.id}:${wf.name}`;
                const detail = `${wf.name} — ${FIT_LABELS[wf.dominant]} · ${wf.processCount} processes`;
                return (
                  <button
                    key={key}
                    type="button"
                    // Tap AND hover AND keyboard — the .dc's title= was hover-only.
                    onClick={() => setActive(active === key ? null : key)}
                    onMouseEnter={() => setActive(key)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(key)}
                    onBlur={() => setActive(null)}
                    aria-label={detail}
                    className={`ax-touch flex h-[22px] min-w-[70px] flex-1 items-center justify-center rounded-[6px] px-1 text-[9px] font-bold focus-visible:shadow-focus-ring focus-visible:outline-none ${CELL_CLASS[wf.dominant]}`}
                  >
                    <span className="truncate">{wf.name}</span>
                  </button>
                );
              })}
            </span>
          </li>
        ))}
      </ul>

      {/* The hover/tap detail, announced politely rather than trapped in a title. */}
      <p aria-live="polite" className="mt-3 min-h-[16px] text-[11px] text-ink-muted">
        {active
          ? streams
              .flatMap((s) => s.workflows.map((wf) => ({ key: `${s.id}:${wf.name}`, s, wf })))
              .filter((x) => x.key === active)
              .map(
                (x) =>
                  `${x.s.name} · ${x.wf.name} — ${FIT_LABELS[x.wf.dominant]} · ${x.wf.processCount} processes`,
              )[0]
          : null}
      </p>
    </div>
  );
}
