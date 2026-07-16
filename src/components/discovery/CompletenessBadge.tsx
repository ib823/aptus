/**
 * ABeam Workbench — completeness badge.
 *
 * Invariant 4: "completeness badges everywhere a process renders". This is the
 * honesty marker — it tells the reviewer how much detail we actually hold before
 * they judge a flow.
 *
 * The badge is a .dc invention (the brief does not specify it) but serves §4.4
 * and §12.11 squarely, so it stays. Its 12% .dc alpha is outside §2's permitted
 * steps, so the fills are rebuilt at 15% via color-mix.
 *
 * `null` completeness means no flow is catalogued (197 of 742). Those get an
 * explicit "no flow" badge rather than a blank — a missing badge would read as
 * an oversight; a stated one reads as the honest fallback it is.
 */

import type { Completeness } from "@/lib/discovery/schema";

const META: Record<Completeness, { label: string; className: string }> = {
  "detailed+variants": {
    label: "Detailed + variants",
    className:
      "bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)] text-decision-standard",
  },
  detailed: { label: "Detailed", className: "bg-navy-soft text-navy" },
  outline: { label: "Outline", className: "bg-ink-tint text-ink-muted" },
};

const NO_FLOW = { label: "No flow catalogued", className: "bg-ink-tint text-ink-muted" };

export interface CompletenessBadgeProps {
  completeness: Completeness | null;
  className?: string;
}

export function CompletenessBadge({ completeness, className }: CompletenessBadgeProps) {
  const meta = completeness ? META[completeness] : NO_FLOW;
  return (
    <span
      className={`inline-flex h-5 items-center rounded-pill px-2 text-[10px] font-bold uppercase tracking-[0.04em] ${meta.className} ${className ?? ""}`}
    >
      {meta.label}
    </span>
  );
}
