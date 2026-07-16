/**
 * ABeam Workbench — Neutral Process Discovery fit bar (brief §6/17).
 *
 * A slim stacked bar reading the four fit states for a stream or workflow:
 * teal standard · amber differ · blue discuss · gray undecided.
 *
 * Brief §6/17: "Always with a count legend; never color-only." The legend is
 * therefore not optional decoration — it is what makes the bar readable to a
 * colourblind reviewer and in a black-and-white export. `showLegend={false}` is
 * only for the compact per-segment bar inside the ribbon, where the segment's
 * own text already carries the counts; the bar there is redundant reinforcement,
 * and it is aria-hidden so a screen reader hears the counts once, not twice.
 */

import { FIT_LABELS, fitMixTotal, type FitMix, type FitState } from "@/lib/discovery/fit";

const ORDER: readonly FitState[] = ["standard", "differ", "discuss", "na", "open"] as const;

/** Tokens only — no hex. The no-stray-hex guard scans this tree. */
const BAR_BG: Record<FitState, string> = {
  standard: "bg-decision-standard",
  differ: "bg-decision-custom",
  discuss: "bg-decision-configure",
  na: "bg-decision-open",
  open: "bg-ink-tint",
};

const DOT_BG: Record<FitState, string> = {
  ...BAR_BG,
  open: "bg-ink-disabled",
};

export interface FitBarProps {
  mix: FitMix;
  showLegend?: boolean;
  className?: string;
}

export function FitBar({ mix, showLegend = true, className }: FitBarProps) {
  const total = fitMixTotal(mix);
  const segments = ORDER.filter((s) => mix[s] > 0);

  return (
    <div className={className}>
      <div
        className="flex h-2 overflow-hidden rounded-pill bg-ink-tint"
        aria-hidden={!showLegend || undefined}
      >
        {total > 0 &&
          segments.map((s) => (
            <div
              key={s}
              className={BAR_BG[s]}
              style={{ width: `${(mix[s] / total) * 100}%` }}
            />
          ))}
      </div>

      {showLegend && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-soft">
          {ORDER.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className={`size-2 shrink-0 rounded-pill ${DOT_BG[s]}`} aria-hidden="true" />
              {/* Label + count, never colour alone (brief §11). */}
              <span>
                {FIT_LABELS[s]} ({mix[s]})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
