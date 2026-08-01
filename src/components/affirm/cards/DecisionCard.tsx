"use client";

/**
 * <DecisionCard> — a single Fit-to-Standard decision question (3 choices +
 * SAP-standard box + collapsible SAP verbatim). Extracted from AffirmCardList
 * so both the internal client surface and the external executive journey render
 * the same card. Fully controlled; no fetch.
 *
 * `calibratedNotes` is optional: the external surface passes calibrated prose
 * (shown when discuss/deviate is selected). The internal surface omits it and
 * behaves exactly as before.
 */

import type { AffirmChoice } from "@/lib/affirm/types";
import type { ProcessFlow } from "@/lib/affirm/process-flow";
import { ProcessFlowStrip } from "@/components/affirm/ProcessFlowStrip";
import {
  DECISION_HELP,
  DECISION_LABELS,
  type CardAnswerState,
  type CardQuestion,
} from "./card-shared";

export function DecisionCard({
  q,
  wording,
  answer,
  readOnly,
  verbatimOpen,
  onToggleVerbatim,
  onSetChoice,
  onSetReason,
  onSaveReason,
  flowRefs,
  flows,
  scopeDescriptions,
  calibratedNotes,
  saved,
}: {
  q: CardQuestion;
  wording: string | null;
  answer: CardAnswerState;
  readOnly: boolean;
  verbatimOpen: boolean;
  onToggleVerbatim: () => void;
  onSetChoice: (c: AffirmChoice) => void;
  onSetReason: (v: string) => void;
  onSaveReason: () => void;
  flowRefs: string[];
  flows: Record<string, ProcessFlow>;
  scopeDescriptions: Record<string, string>;
  calibratedNotes?: Partial<Record<AffirmChoice, string>>;
  /** External autosave tick — internal omits it. */
  saved?: boolean;
}) {
  const isStd = answer.choice === "standard";
  const activeNote = calibratedNotes?.[answer.choice];
  return (
    <article className="affirm-card rounded-card-warm border border-border-default bg-paper px-[22px] py-5 shadow-card">
      <header className="ac-head mb-2 flex items-center gap-2.5">
        <span className="ac-category text-sm font-semibold text-ink-soft">
          {q.sapTopic ?? "General"}
        </span>
        <span className="fmt-badge decision rounded-pill bg-decision-configure/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-decision-configure">
          Decision
        </span>
        {isStd && (
          <span className="rounded-pill bg-decision-standard/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-decision-standard">
            default
          </span>
        )}
        {q.isCustom && (
          <span className="rounded-pill bg-navy/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-navy">
            consultant-added
          </span>
        )}
        <span className="ac-qid ml-auto font-mono text-[11px] text-ink-muted">{q.id}</span>
      </header>

      {q.aboutText && (
        <p className="about-line mb-2 text-[13px] leading-5 text-ink-soft">
          <span className="font-semibold text-ink">What this is about:</span> {q.aboutText}
        </p>
      )}

      <p className="ac-question mb-3 text-[15px] leading-[22px] text-ink">{wording}</p>

      {flowRefs.map((ref) => (
        <ProcessFlowStrip
          key={ref}
          variant="embedded"
          scopeItemId={ref}
          scopeItemDescription={scopeDescriptions[ref] ?? null}
          flow={flows[ref] ?? null}
        />
      ))}

      {q.standardMeans && (
        <div className="standard-box mb-3 rounded-input border border-decision-standard/30 bg-decision-standard/5 px-3.5 py-2.5">
          <span className="label block text-[11px] font-bold uppercase tracking-wider text-decision-standard">
            What &quot;Adopt SAP standard&quot; means here
          </span>
          <span className="text mt-1 block text-[13px] leading-[19px] text-ink-soft">
            {q.standardMeans}
          </span>
        </div>
      )}

      {q.sapVerbatim && (
        <>
          <button
            type="button"
            onClick={onToggleVerbatim}
            data-tour="affirm-verbatim"
            className="verbatim-toggle inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-muted hover:text-ink"
            aria-expanded={verbatimOpen}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
              className={`transition ${verbatimOpen ? "rotate-90" : ""}`}
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            Show the exact SAP wording
          </button>
          {verbatimOpen && (
            <div className="sap-verbatim mt-1.5 mb-2.5 rounded-input bg-ink-tint px-3.5 py-2.5">
              <span className="label block font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                SAP verbatim · source of truth · never changed
              </span>
              <span className="text mt-1 block text-xs leading-[18px] text-ink-soft">
                {q.sapVerbatim}
              </span>
            </div>
          )}
        </>
      )}

      <p className="ac-source mt-3 mb-3 font-mono text-[11px] text-ink-muted">
        SAP BDC · Level 2{q.sapArea ? ` · ${q.sapArea}` : ""}
        {q.sscuiRef && q.sscuiRef !== "-" && q.sscuiRef !== "N/A" ? ` · ${q.sscuiRef}` : ""}
      </p>

      <div
        data-tour="affirm-choices"
        className="choice-row flex flex-wrap gap-3"
        role="radiogroup"
        aria-label={`Your choice for ${q.id}`}
      >
        {(["standard", "discuss", "deviate"] as const).map((c) => {
          const selected = answer.choice === c;
          const tone = c === "standard" ? "std" : c === "discuss" ? "cfg" : "cust";
          const onCls =
            tone === "std"
              ? "bg-decision-standard text-white border-decision-standard"
              : tone === "cfg"
                ? "bg-decision-configure text-white border-decision-configure"
                : "bg-decision-custom text-white border-decision-custom";
          return (
            <div key={c} className="choice-wrap min-w-[140px]">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={readOnly}
                onClick={() => onSetChoice(c)}
                className={`choice ${tone} inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-pill border px-3.5 text-xs font-semibold transition ${
                  selected
                    ? onCls
                    : "border-border-default bg-paper text-ink-soft hover:border-border-strong hover:bg-ink-tint"
                } ${readOnly ? "cursor-not-allowed opacity-70" : ""}`}
              >
                {DECISION_LABELS[c]}
              </button>
              <p className="choice-help mt-1 text-center text-[11px] leading-4 text-ink-muted">
                {DECISION_HELP[c]}
              </p>
            </div>
          );
        })}
      </div>

      {/* External calibrated note (qualitative expectation) — internal omits it.
          custom → banner-warn + decision-custom border; discuss → navy note. */}
      {activeNote && answer.choice !== "standard" && (
        <p
          className={`calibrated-note mt-3 rounded-input border px-3.5 py-2.5 text-[13px] leading-[19px] text-ink-soft ${
            answer.choice === "deviate"
              ? "border-[color-mix(in_srgb,var(--color-decision-custom)_30%,transparent)] bg-banner-warn"
              : "border-navy-border bg-navy-soft"
          }`}
          aria-live="polite"
        >
          {activeNote}
        </p>
      )}

      {answer.choice === "deviate" && (
        <div className="reason-block mt-3 rounded-input border border-[color-mix(in_srgb,var(--color-decision-custom)_30%,transparent)] bg-banner-warn px-3.5 py-2.5 text-[13px] leading-[19px]">
          <span className="l mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-decision-custom">
            Why we differ
          </span>
          <textarea
            value={answer.reason}
            onChange={(e) => onSetReason(e.target.value)}
            onBlur={onSaveReason}
            disabled={readOnly}
            rows={3}
            maxLength={2000}
            aria-label={`Reason we differ for ${q.id}`}
            placeholder="Required for a deviation."
            className="w-full resize-y rounded border-0 bg-transparent text-ink focus:outline-none"
          />
        </div>
      )}

      {answer.saving ? (
        <p className="mt-2 text-[11px] text-ink-muted" aria-live="polite">saving…</p>
      ) : saved && !answer.error ? (
        <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-ink-muted" aria-live="polite">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-decision-standard)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Saved
        </p>
      ) : null}
      {answer.error && <p className="mt-2 text-[11px] text-cta" role="alert">{answer.error}</p>}
    </article>
  );
}
