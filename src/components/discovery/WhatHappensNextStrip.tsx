/**
 * ABeam Workbench — Neutral Process Discovery "what happens next" strip.
 *
 * Four stages: Discover · Workshop · Shortlist · Decide. `current` is 1-based,
 * matching the Affirm WhatHappensNext convention (V1 = 1 Discover, V4 = 2
 * Workshop).
 *
 * Rendered as an ordered list so the sequence is conveyed structurally, not only
 * by the visual connectors — which are decorative and aria-hidden.
 */

const STAGES = ["Discover", "Workshop", "Shortlist", "Decide"] as const;

export interface WhatHappensNextStripProps {
  current?: number;
  className?: string;
}

export function WhatHappensNextStrip({ current = 1, className }: WhatHappensNextStripProps) {
  return (
    <section
      aria-labelledby="what-happens-next"
      className={`rounded-card-warm border border-border-default bg-paper px-6 py-5 shadow-card-warm ${className ?? ""}`}
    >
      <h2
        id="what-happens-next"
        className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
      >
        What happens next
      </h2>
      <ol className="flex flex-wrap items-center gap-0">
        {STAGES.map((label, i) => {
          const isCurrent = i + 1 === current;
          return (
            <li key={label} className="flex items-center">
              <span className="flex items-center gap-2">
                <span
                  className={`flex size-7 items-center justify-center rounded-pill font-mono text-[11px] font-bold ${
                    isCurrent ? "bg-navy text-white" : "bg-ink-tint text-ink-soft"
                  }`}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <span
                  className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${
                    isCurrent ? "text-ink" : "text-ink-soft"
                  }`}
                >
                  {label}
                  {isCurrent && <span className="sr-only"> (current stage)</span>}
                </span>
              </span>
              {i < STAGES.length - 1 && (
                <span className="mx-3 h-px w-6 bg-border-default" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
