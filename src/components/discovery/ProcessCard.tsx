/**
 * ABeam Workbench — process story card (brief §6/18).
 *
 * "Paper card radius 12: scope chip + serif 18 neutral process name + one-line
 * best-practice description (13/19) + meta row (badge, role count, fit state
 * dot) + chevron. Fallback variant (no flow): compact — chip + name +
 * description + 'no step flow catalogued' caption; never a fake flow."
 *
 * The fit dot is never alone: it is paired with its label text, per §11
 * ("decisions never rely on color alone"). The .dc renders the dot bare.
 */

import Link from "next/link";
import { FIT_LABELS, type FitState } from "@/lib/discovery/fit";
import { CARD_NO_FLOW_CAPTION } from "@/lib/discovery/copy";
import type { DiscoveryProcessCard } from "@/lib/discovery/external/journey";
import { CompletenessBadge } from "./CompletenessBadge";

const DOT: Record<FitState, string> = {
  standard: "bg-decision-standard",
  differ: "bg-decision-custom",
  discuss: "bg-decision-configure",
  na: "bg-decision-open",
  open: "bg-ink-disabled",
};

function stepCountLabel(p: DiscoveryProcessCard): string {
  if (!p.hasFlow) return CARD_NO_FLOW_CAPTION;
  const main = `${p.mainSteps} main step${p.mainSteps === 1 ? "" : "s"}`;
  return p.subSteps > 0 ? `${main} · ${p.subSteps} sub-steps` : main;
}

export interface ProcessCardProps {
  process: DiscoveryProcessCard;
}

export function ProcessCard({ process }: ProcessCardProps) {
  // Brief §9: "Not applicable" dims the row.
  const dimmed = process.state === "na";

  return (
    <li>
      <Link
        href={`/d/process/${encodeURIComponent(process.id)}`}
        className={`ax-touch block h-full rounded-card-warm border border-border-default bg-paper px-5 py-[18px] shadow-card-warm transition-[box-shadow,transform,opacity] duration-[var(--dur-calm)] ease-[var(--ease-calm)] hover:-translate-y-px hover:shadow-card-warm-hover focus-visible:border-navy focus-visible:shadow-focus-ring focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${dimmed ? "opacity-60" : ""}`}
      >
        <span className="mb-2 flex flex-wrap items-center gap-2">
          {/* Scope chip — brief §6/2: navy fill, radius 5, mono 11 bold. Never the title. */}
          <span className="inline-flex h-[22px] items-center rounded-[5px] bg-navy px-[7px] font-mono text-[11px] font-bold text-white">
            {process.id}
          </span>
          <CompletenessBadge completeness={process.completeness} />
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-muted">
            <span className={`size-2 shrink-0 rounded-pill ${DOT[process.state]}`} aria-hidden="true" />
            {/* Label, not colour alone (§11). */}
            {FIT_LABELS[process.state]}
          </span>
        </span>

        <span className="mb-1.5 block font-serif text-lg font-medium text-ink">{process.name}</span>
        <span className="mb-2.5 block text-[13px] leading-[19px] text-ink-soft">
          {process.description}
        </span>
        <span className="block text-[11px] text-ink-muted">{stepCountLabel(process)}</span>
      </Link>
    </li>
  );
}
