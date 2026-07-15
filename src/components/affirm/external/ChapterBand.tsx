/**
 * <ChapterBand> — S6 executive process story (design §3B-19). A numbered navy
 * rail with a connector line links the chapters; each chapter card carries the
 * business title/summary, role + Fiori chips, an optional benefit note, and a
 * native <details> reveal of the SAP-verbatim steps as a horizontal step-strip
 * lane (172px cards; stacks on mobile). Token-only; keyboard-accessible.
 */

import type { FlowChapter } from "@/lib/affirm/process-flow";

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "navy" }) {
  const cls = tone === "navy" ? "bg-navy-soft text-navy font-mono" : "bg-ink-tint text-ink-soft";
  return (
    <span className={`inline-flex h-[22px] items-center rounded-pill px-2 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  );
}

export function ChapterBand({ chapters }: { chapters: FlowChapter[] }) {
  return (
    <ol className="flex flex-col" aria-label="Process chapters">
      {chapters.map((c, idx) => {
        const isLast = idx === chapters.length - 1;
        return (
          <li key={c.chapterNumber} className="relative flex gap-4 pb-5">
            {/* Rail: node + connector */}
            <div className="relative flex w-7 shrink-0 flex-col items-center">
              <span
                className="flex size-7 items-center justify-center rounded-full bg-navy font-serif text-[14px] font-medium text-white"
                aria-hidden="true"
              >
                {c.chapterNumber}
              </span>
              {!isLast && <span className="mt-1 w-px flex-1 bg-navy-border" aria-hidden="true" />}
            </div>

            {/* Card */}
            <div className="min-w-0 flex-1 rounded-card-warm border border-border-default bg-paper px-5 py-[18px] shadow-card">
              <h3 className="font-serif text-[18px] font-medium text-ink">{c.title}</h3>
              <p className="mt-1 text-[13px] leading-[19px] text-ink-soft">{c.summary}</p>

              {(c.roles.length > 0 || c.fioriApps.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {c.roles.map((r) => (
                    <Chip key={`r-${r}`}>{r}</Chip>
                  ))}
                  {c.fioriApps.map((a) => (
                    <Chip key={`a-${a}`} tone="navy">
                      {a}
                    </Chip>
                  ))}
                </div>
              )}

              {c.benefitNote && (
                <p className="mt-3 rounded-input border border-[color-mix(in_srgb,var(--color-decision-standard)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-decision-standard)_5%,var(--color-paper))] px-3 py-2 text-[13px] leading-5 text-ink-soft">
                  {c.benefitNote}
                </p>
              )}

              {c.steps.length > 0 && (
                <details className="group mt-3">
                  <summary className="ax-touch inline-flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium text-ink-muted transition hover:text-navy">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="transition group-open:rotate-90">
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                    See the exact SAP steps
                  </summary>
                  <div className="ax-snap-lane mt-2 rounded-input bg-ink-tint p-3.5">
                    <p className="w-full font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                      SAP verbatim · source of truth · never changed
                    </p>
                    {c.steps.map((s) => (
                      <div
                        key={s.stepNumber}
                        className="flex w-[172px] shrink-0 flex-col gap-1.5 rounded-step border border-navy-border bg-paper p-3"
                      >
                        <span className="flex size-[22px] items-center justify-center rounded-full bg-navy font-mono text-[11px] font-bold text-white">
                          {s.stepNumber}
                        </span>
                        <span className="text-[13px] font-semibold leading-[18px] text-ink">{s.activity}</span>
                        {s.fioriApps.length > 0 && (
                          <span className="font-mono text-[11px] text-ink-muted">{s.fioriApps.join(", ")}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
