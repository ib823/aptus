/**
 * LifecycleStepper — bundle lifecycle Draft → Issued → Submitted →
 * Released (v2 CCC follow-up §6).
 *
 * Distinct from AffirmStepper (workflow steps for the consultant
 * journey: Scope → Editor → Affirm → Review → Output). This stepper
 * tracks the bundle's state machine, which is one step per row in the
 * DB.
 */

import { Fragment } from "react";

export type BundleLifecycle = "draft" | "issued" | "submitted" | "released";

const ORDER: BundleLifecycle[] = ["draft", "issued", "submitted", "released"];
const LABEL: Record<BundleLifecycle, string> = {
  draft: "Draft",
  issued: "Issued",
  submitted: "Submitted",
  released: "Released",
};

interface Props {
  current: BundleLifecycle;
  caption?: string;
  meta?: string;
}

export function LifecycleStepper({ current, caption, meta }: Props) {
  const currentIdx = ORDER.indexOf(current);

  return (
    <div className="rounded-card-warm border border-border-default bg-paper p-[22px] shadow-card">
      <header className="mb-3.5 flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Bundle lifecycle
          </p>
          <h3 className="mt-1 font-serif text-xl text-ink">
            Where the bundle is right now
          </h3>
        </div>
        {meta && (
          <span className="font-mono text-[11px] text-ink-muted">{meta}</span>
        )}
      </header>

      {/* .lifecycle / .lc-step / .lc-arr — responsive pass collapses
          this to a vertical list at <=767px. */}
      <ol className="lifecycle flex flex-wrap items-center gap-2">
        {ORDER.map((s, idx) => {
          const isDone = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <Fragment key={s}>
              <li>
                <span
                  className={`lc-step inline-flex h-[34px] items-center gap-2.5 rounded-pill border px-3 pl-2 text-sm ${
                    isCurrent
                      ? "border-navy bg-navy text-white"
                      : isDone
                        ? "border-decision-standard/30 bg-decision-standard/5 text-ink"
                        : "border-border-default bg-paper text-ink-muted"
                  }`}
                >
                  <span
                    className={`lc-n inline-flex size-[22px] items-center justify-center rounded-full text-[11px] font-bold ${
                      isCurrent
                        ? "bg-cta text-white"
                        : isDone
                          ? "bg-decision-standard text-white"
                          : "bg-ink-tint text-ink-muted"
                    }`}
                  >
                    {isDone ? (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </span>
                  {LABEL[s]}
                </span>
              </li>
              {idx < ORDER.length - 1 && (
                <li
                  aria-hidden="true"
                  className="lc-arr font-mono text-sm text-ink-disabled"
                >
                  →
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>

      {caption && (
        <p className="mt-3 text-sm text-ink-soft">
          <strong className="text-ink">
            The bundle is at {LABEL[current]}.
          </strong>{" "}
          {caption}
        </p>
      )}
    </div>
  );
}
