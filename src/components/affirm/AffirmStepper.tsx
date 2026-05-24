/**
 * AffirmStepper — the 5-chip in-page workflow stepper.
 *
 * v2 (CCC follow-up §6): adds the consultant Question editor step
 * between Scope and Affirm.
 *
 * Visual: Scope -> Question editor -> Affirm -> Review & release ->
 * Output. Active step uses navy bg with CTA-red numeral; done steps
 * use the signed-green numeral; pending steps use ink-tint. Mirrors
 * .workflow-stepper from the v2 design.
 */

import { Fragment } from "react";

export type AffirmStep =
  | "scope"
  | "editor"
  | "affirm"
  | "review"
  | "output";

const ORDER: AffirmStep[] = ["scope", "editor", "affirm", "review", "output"];
const LABEL: Record<AffirmStep, string> = {
  scope: "Scope",
  editor: "Question editor",
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
    // .workflow-stepper / .ws-step / .ws-arr — responsive pass turns
    // this into a vertical list at <=767px.
    <ol
      className="workflow-stepper mb-5 flex flex-wrap items-center gap-2"
      aria-label="Affirmation workflow"
    >
      {ORDER.map((s, idx) => {
        const state =
          idx < currentIdx ? "done" : idx === currentIdx ? "current" : "pending";
        return (
          <Fragment key={s}>
            <li>
              <span
                className={`ws-step inline-flex h-[30px] items-center gap-2 rounded-pill border px-3 pl-2 text-xs ${
                  state === "current"
                    ? "border-navy bg-navy text-white"
                    : state === "done"
                      ? "border-border-default bg-paper text-ink-soft"
                      : "border-border-default bg-paper text-ink-muted"
                }`}
              >
                <span
                  className={`n inline-flex size-[18px] items-center justify-center rounded-full font-mono text-[10px] font-bold ${
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
                className="ws-arr font-mono text-sm text-ink-disabled"
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
