/**
 * ABeam Workbench — Neutral Process Discovery value-stream ribbon (brief §6/15).
 *
 * "The end-to-end streams as connected horizontal segments (navy family), each:
 * stream name + progress ring (16) + a thin fit bar (17) showing the
 * standard/differ/discuss/undecided mix. States per segment: untouched
 * (ink-tint), in-progress (navy-soft + navy border), reviewed (teal 15% + teal
 * ring). One accent — never rainbow. Mobile: vertical stack."
 *
 * Two deliberate departures from the .dc, both because the brief wins:
 *  - The .dc stacks vertically at every width and has NO per-segment fit bar.
 *    The brief specifies horizontal connected segments with a fit bar, and
 *    vertical stack on mobile only. Built to the brief.
 *  - The .dc reuses the navy-soft "in-progress" style for reviewed streams. The
 *    brief gives reviewed its own teal treatment. Built to the brief.
 *
 * Streams come from the loader — all 10, never the .dc's 8, and never its
 * "not modeled in this prototype pass" scaffolding.
 */

import Link from "next/link";
import type { DiscoveryStreamSummary } from "@/lib/discovery/external/journey";
import { DiscoveryProgressRing } from "./DiscoveryProgressRing";
import { FitBar } from "./FitBar";

type SegmentState = "untouched" | "in-progress" | "reviewed";

function segmentState(s: DiscoveryStreamSummary): SegmentState {
  if (s.processCount > 0 && s.decided === s.processCount) return "reviewed";
  if (s.decided > 0) return "in-progress";
  return "untouched";
}

/**
 * Brief §6/15: reviewed is "teal 15%". `color-mix` against the token is the
 * house rule for alpha (never a new hex, never a hardcoded rgba).
 */
const SEGMENT_CLASS: Record<SegmentState, string> = {
  untouched: "border-border-default bg-paper",
  "in-progress": "border-navy-border bg-navy-soft",
  reviewed: "border-decision-standard/30 bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)]",
};

const PILL_CLASS: Record<SegmentState, string> = {
  untouched: "bg-ink-tint text-ink-muted",
  "in-progress": "bg-navy-soft text-navy",
  reviewed: "bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)] text-decision-standard",
};

const PILL_LABEL: Record<SegmentState, string> = {
  untouched: "Not started",
  "in-progress": "In progress",
  reviewed: "Reviewed",
};

export interface ValueStreamRibbonProps {
  streams: DiscoveryStreamSummary[];
}

export function ValueStreamRibbon({ streams }: ValueStreamRibbonProps) {
  return (
    <ul className="mb-9 grid gap-3.5 lg:grid-cols-2">
      {streams.map((s) => {
        const state = segmentState(s);
        const pillId = `stream-${s.id}-state`;
        return (
          <li key={s.id}>
            <Link
              href={`/d/stream/${encodeURIComponent(s.id)}`}
              aria-describedby={pillId}
              className={`ax-touch flex items-center gap-5 rounded-card-warm border px-6 py-[22px] shadow-card-warm transition-[box-shadow,transform] duration-[var(--dur-calm)] ease-[var(--ease-calm)] hover:-translate-y-px hover:shadow-card-warm-hover focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${SEGMENT_CLASS[state]}`}
            >
              <DiscoveryProgressRing
                value={s.decided}
                max={s.processCount}
                tone={state === "reviewed" ? "standard" : "navy"}
              />

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-serif text-xl font-medium text-navy">{s.name}</span>
                  <span
                    id={pillId}
                    className={`inline-flex h-[22px] items-center rounded-pill px-2 text-[10px] font-bold uppercase tracking-[0.06em] ${PILL_CLASS[state]}`}
                  >
                    {PILL_LABEL[state]}
                  </span>
                </span>

                {/* The full sentence is the accessible text: a screen reader
                    hears the counts once, from here, not from the ring or bar. */}
                <span className="mt-1 block text-[13px] leading-[19px] text-ink-soft">
                  {s.decided} of {s.processCount} processes reviewed · {s.workflowCount} workflows
                </span>

                <FitBar mix={s.mix} showLegend={false} className="mt-2.5" />
              </span>

              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                aria-hidden="true"
                className="shrink-0 text-border-strong"
              >
                <path
                  d="M6.5 3.5 L12 9 L6.5 14.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
