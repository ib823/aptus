/**
 * <JourneyProgressBar> — the sticky sub-header on the S6 process story and S7
 * affirm screen: back link, scope chip, process name, a progress bar and the
 * "n of m answered" label. Token-only, server-rendered.
 */

import Link from "next/link";

export function JourneyProgressBar({
  scopeItemId,
  name,
  answered,
  total,
  backHref,
}: {
  scopeItemId: string;
  name: string;
  answered: number;
  total: number;
  backHref: string;
}) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="ax-no-print sticky top-14 z-20 border-b border-border-default bg-paper">
      <div className="mx-auto flex max-w-[880px] items-center gap-4 px-[clamp(16px,4vw,32px)] py-2.5">
        <Link
          href={backHref}
          className="shrink-0 text-ink-soft transition hover:text-navy"
          aria-label="Back"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <span className="inline-flex h-[22px] shrink-0 items-center rounded-[5px] bg-navy px-1.5 font-mono text-[11px] font-bold text-white">
          {scopeItemId}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{name}</span>
        <div
          className="hidden h-2 w-32 overflow-hidden rounded-pill bg-ink-tint sm:block"
          role="progressbar"
          aria-valuenow={answered}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${answered} of ${total} answered`}
        >
          <span className="block h-full bg-decision-standard" style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 font-mono text-[11px] text-ink-muted">
          {answered} of {total} answered
        </span>
      </div>
    </div>
  );
}
