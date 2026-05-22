/**
 * AffirmStepper — the 4-chip in-page workflow stepper.
 *
 * Visual: Scope -> Affirm -> Review -> Output. Active step uses navy bg
 * with CTA-red numeral; done steps use the signed-green numeral;
 * pending steps use ink-tint. Mirrors the .workflow-stepper pattern
 * from the design (enhancement-review.css).
 */

import { Fragment } from "react";

export type AffirmStep = "scope" | "affirm" | "review" | "output";

const ORDER: AffirmStep[] = ["scope", "affirm", "review", "output"];
const LABEL: Record<AffirmStep, string> = {
  scope: "Scope",
  affirm: "Affirm",
  review: "Review & release",
  output: "Output",
};

interface Props {
  current: AffirmStep;
}

export function AffirmStepper({ current }: Props) {
  const currentIdx = ORDER.indexOf(current);

  return (
    <ol className="mb-5 flex flex-wrap items-center gap-2" aria-label="Affirmation workflow">
      {ORDER.map((s, idx) => {
        const state =
          idx < currentIdx ? "done" : idx === currentIdx ? "current" : "pending";
        return (
          <Fragment key={s}>
            <li>
              <span
                className={`inline-flex h-[30px] items-center gap-2 rounded-pill border px-3 pl-2 text-xs ${
                  state === "current"
                    ? "border-navy bg-navy text-white"
                    : state === "done"
                      ? "border-border-default bg-paper text-ink-soft"
                      : "border-border-default bg-paper text-ink-muted"
                }`}
              >
                <span
                  className={`inline-flex size-[18px] items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                    state === "current"
                      ? "bg-cta text-white"
                      : state === "done"
                        ? "bg-decision-standard text-white"
                        : "bg-ink-tint text-ink-muted"
                  }`}
                >
                  {idx + 1}
                </span>
                {LABEL[s]}
              </span>
            </li>
            {idx < ORDER.length - 1 && (
              <li
                aria-hidden="true"
                className="font-mono text-sm text-ink-disabled"
              >
                →
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}
