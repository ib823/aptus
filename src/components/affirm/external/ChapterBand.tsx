/**
 * <ChapterBand> — numbered chapter cards for the executive process story.
 * Horizontal scroll-snap band on desktop, vertical stack on mobile. Each card
 * shows the business title/summary, role + Fiori chips, an optional benefit
 * callout, and a native <details> reveal of the SAP-verbatim steps (locked,
 * muted, labelled "SAP source of truth — never altered"). Server component;
 * <details> gives keyboard-accessible expand/collapse with no client JS.
 */

import type { FlowChapter } from "@/lib/affirm/process-flow";

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "navy" }) {
  const cls =
    tone === "navy"
      ? "bg-navy-soft text-navy"
      : "bg-ink-tint text-ink-soft";
  return <span className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export function ChapterBand({ chapters }: { chapters: FlowChapter[] }) {
  return (
    <ol
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-1 md:overflow-visible"
      aria-label="Process chapters"
    >
      {chapters.map((c) => (
        <li
          key={c.chapterNumber}
          className="w-[85%] shrink-0 snap-start rounded-card-warm border border-border-default bg-paper p-5 shadow-card md:w-auto"
        >
          <div className="mb-2 flex items-baseline gap-2">
            <span className="font-serif text-2xl text-navy" aria-hidden="true">
              {c.chapterNumber}
            </span>
            <h3 className="font-serif text-lg text-ink">{c.title}</h3>
          </div>
          <p className="text-[14px] leading-6 text-ink-soft">{c.summary}</p>

          {(c.roles.length > 0 || c.fioriApps.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.roles.map((r) => (
                <Chip key={`r-${r}`} tone="navy">
                  {r}
                </Chip>
              ))}
              {c.fioriApps.map((a) => (
                <Chip key={`a-${a}`}>{a}</Chip>
              ))}
            </div>
          )}

          {c.benefitNote && (
            <p className="mt-3 rounded-input border border-decision-standard/30 bg-decision-standard/5 px-3 py-2 text-[13px] leading-5 text-ink-soft">
              {c.benefitNote}
            </p>
          )}

          {c.steps.length > 0 && (
            <details className="mt-3 group">
              <summary className="cursor-pointer list-none text-[12px] font-medium text-ink-muted hover:text-ink">
                <span className="inline-flex items-center gap-1.5">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                    className="transition group-open:rotate-90"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  See the exact SAP steps
                </span>
              </summary>
              <div className="mt-2 rounded-input bg-ink-tint px-3.5 py-2.5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                  SAP source of truth — never altered
                </p>
                <ol className="mt-1.5 space-y-1">
                  {c.steps.map((s) => (
                    <li key={s.stepNumber} className="text-xs leading-[18px] text-ink-soft">
                      <span className="mr-1.5 font-mono text-ink-muted">{s.stepNumber}.</span>
                      {s.activity}
                      {s.fioriApps.length > 0 && (
                        <span className="ml-1.5 text-ink-muted">· {s.fioriApps.join(", ")}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}
