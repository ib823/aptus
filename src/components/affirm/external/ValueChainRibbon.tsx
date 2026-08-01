/**
 * <ValueChainRibbon> — the S4 centerpiece. One segment per value stream: a
 * progress ring, the stream name + status pill, "{affirmed} of {total}
 * processes affirmed", the scope-item nodes, and a chevron into the stream.
 * Token-only; segment fills use the permitted color-mix alpha steps.
 */

import Link from "next/link";
import { ProgressRing } from "./ProgressRing";
import { StatusPill } from "./StatusPill";
import type { JourneyStreamSummary, NodeState } from "@/lib/affirm/external/journey";

const SEGMENT: Record<JourneyStreamSummary["status"], string> = {
  complete:
    "bg-[color-mix(in_srgb,var(--color-decision-standard)_12%,var(--color-paper))] border-[color-mix(in_srgb,var(--color-decision-standard)_30%,transparent)]",
  started: "bg-navy-soft border-navy-border",
  "not-started": "bg-paper border-border-default",
};

const NODE: Record<NodeState, string> = {
  done: "bg-[color-mix(in_srgb,var(--color-decision-standard)_15%,transparent)] text-decision-standard",
  some: "bg-navy-soft text-navy",
  none: "bg-ink-tint text-ink-muted",
};
const NODE_DOT: Record<NodeState, string> = {
  done: "bg-decision-standard",
  some: "bg-navy",
  none: "bg-ink-disabled",
};

function statusPill(status: JourneyStreamSummary["status"]) {
  if (status === "complete") return <StatusPill tone="standard" mono>Complete</StatusPill>;
  if (status === "started") return <StatusPill tone="navy" mono>In progress</StatusPill>;
  return <StatusPill tone="neutral" mono>Not started</StatusPill>;
}

export function ValueChainRibbon({ streams }: { streams: JourneyStreamSummary[] }) {
  return (
    <div className="mb-9 flex flex-col gap-3.5" aria-label="Your value streams">
      {streams.map((s) => (
        <Link
          key={s.streamId}
          href={`/a/stream/${encodeURIComponent(s.streamId)}`}
          className={`group flex items-center gap-5 rounded-card-warm border px-6 py-[22px] shadow-card transition hover:-translate-y-px hover:shadow-card-hover focus-visible:shadow-focus-ring focus-visible:outline-none ${SEGMENT[s.status]}`}
        >
          <ProgressRing
            value={s.answered}
            max={s.total}
            color={s.status === "complete" ? "standard" : "navy"}
            label={`${s.answered} of ${s.total} answered in ${s.streamName}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-serif text-[20px] font-medium text-navy">{s.streamName}</span>
              {statusPill(s.status)}
            </div>
            <p className="mt-1 text-[13px] leading-[19px] text-ink-soft">
              {s.processesAffirmed} of {s.processesTotal} process
              {s.processesTotal === 1 ? "" : "es"} affirmed
            </p>
            {s.nodes.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {s.nodes.map((n) => (
                  <span
                    key={n.scopeItemId}
                    className={`inline-flex h-6 items-center gap-1.5 rounded-pill px-2 font-mono text-[11px] font-semibold ${NODE[n.state]}`}
                  >
                    <span className={`size-1.5 rounded-full ${NODE_DOT[n.state]}`} aria-hidden="true" />
                    {n.scopeItemId}
                  </span>
                ))}
              </div>
            )}
          </div>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
      ))}
    </div>
  );
}
