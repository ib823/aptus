/**
 * <WhatHappensNext> — the numbered Affirm → Workshop → Sizing → Decision strip
 * (design §3B-24). `current` is the 1-based active stage (home=1, summary=2).
 * Token-only, server-rendered.
 */

const STAGES = ["Affirm", "Workshop", "Sizing", "Decision"] as const;

function nodeClasses(index1: number, current: number): string {
  if (index1 === current) return "bg-navy text-white";
  if (index1 < current)
    return "bg-[color-mix(in_srgb,var(--color-navy)_18%,var(--color-paper))] text-navy";
  return "bg-ink-tint text-ink-muted";
}

export function WhatHappensNext({ current = 1 }: { current?: number }) {
  return (
    <section className="rounded-card-warm border border-border-default bg-paper px-6 py-5 shadow-card">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
        What happens next
      </p>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3" aria-label="What happens next">
        {STAGES.map((stage, i) => {
          const n = i + 1;
          return (
            <li key={stage} className="flex items-center gap-2">
              <span
                className={`flex size-7 items-center justify-center rounded-full font-mono text-[11px] font-bold ${nodeClasses(n, current)}`}
                aria-current={n === current ? "step" : undefined}
              >
                {n}
              </span>
              <span
                className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${
                  n === current ? "text-ink" : "text-ink-muted"
                }`}
              >
                {stage}
              </span>
              {i < STAGES.length - 1 && (
                <span className="mx-1 h-px w-6 bg-border-default" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
