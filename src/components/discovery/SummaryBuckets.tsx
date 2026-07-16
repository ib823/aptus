/**
 * ABeam Workbench — V4 summary buckets (brief §6/11).
 *
 * "Three cards (Standard teal / Discuss blue / Differ amber): 15% header band +
 * serif 28 count + item list with scope chips; differ bucket shows each reason in
 * a banner-warn inset."
 *
 * Built to the brief, not the .dc: 15% bands (not 12%), serif 28 (not 24), and
 * the reason inset carries its amber border (conflict #22).
 */

import { BUCKET_EMPTY, DIFFER_NO_REASON } from "@/lib/discovery/copy";
import type { DiscoverySummaryBucketItem } from "@/lib/discovery/external/journey";

interface BucketSpec {
  key: "standard" | "discuss" | "differ";
  title: string;
  band: string;
  text: string;
}

/** Order per §6/11: Standard teal · Discuss blue · Differ amber. */
const BUCKETS: BucketSpec[] = [
  {
    key: "standard",
    title: "Standard",
    band: "bg-[color-mix(in_srgb,var(--decision-standard)_15%,transparent)]",
    text: "text-decision-standard",
  },
  {
    key: "discuss",
    title: "Discuss",
    band: "bg-[color-mix(in_srgb,var(--decision-configure)_15%,transparent)]",
    text: "text-decision-configure",
  },
  {
    key: "differ",
    title: "We differ",
    band: "bg-[color-mix(in_srgb,var(--decision-custom)_15%,transparent)]",
    text: "text-decision-custom",
  },
];

export interface SummaryBucketsProps {
  buckets: Record<"standard" | "discuss" | "differ", DiscoverySummaryBucketItem[]>;
}

export function SummaryBuckets({ buckets }: SummaryBucketsProps) {
  return (
    <div className="mb-8 grid gap-4 lg:grid-cols-3">
      {BUCKETS.map((b) => {
        const items = buckets[b.key];
        return (
          <section
            key={b.key}
            aria-labelledby={`bucket-${b.key}`}
            className="overflow-hidden rounded-card-warm border border-border-default bg-paper"
          >
            <h2 id={`bucket-${b.key}`} className={`flex items-baseline px-4 py-2.5 ${b.band}`}>
              <span className={`font-serif text-2xl font-medium ${b.text}`}>{items.length}</span>
              <span
                className={`ml-2 text-xs font-semibold uppercase tracking-[0.05em] ${b.text}`}
              >
                {b.title}
              </span>
            </h2>

            <div className="max-h-[260px] overflow-auto px-4 py-3.5">
              {items.length === 0 ? (
                <p className="text-xs text-ink-disabled">{BUCKET_EMPTY}</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {items.map((it) => (
                    <li key={it.id}>
                      <div className="flex items-start gap-1.5">
                        <span className="mt-px inline-flex h-5 shrink-0 items-center rounded-[5px] bg-navy px-1.5 font-mono text-[10px] font-bold text-white">
                          {it.id}
                        </span>
                        <span className="text-xs leading-4 text-ink">{it.name}</span>
                      </div>

                      {b.key === "differ" && (
                        <p
                          className={`ml-[26px] mt-1.5 rounded-[6px] border px-2 py-1.5 text-[11px] leading-4 ${
                            it.reason
                              ? "border-decision-custom/30 bg-banner-warn text-ink-soft"
                              : "border-decision-custom/30 bg-banner-warn font-semibold text-decision-custom"
                          }`}
                        >
                          {/* Honest gap capture (§9): an unexplained differ says
                              so, rather than showing a blank that reads as done. */}
                          {it.reason ?? DIFFER_NO_REASON}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
