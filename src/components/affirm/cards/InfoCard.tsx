"use client";

/**
 * <InfoCard> — a single Information question (free-text answer + optional
 * "flag for workshop"). Extracted from AffirmCardList; fully controlled.
 */

import type { ProcessFlow } from "@/lib/affirm/process-flow";
import { ProcessFlowStrip } from "@/components/affirm/ProcessFlowStrip";
import type { CardAnswerState, CardQuestion } from "./card-shared";

export function InfoCard({
  q,
  wording,
  answer,
  readOnly,
  verbatimOpen,
  onToggleVerbatim,
  onSetFlag,
  onSetReason,
  onSaveReason,
  flowRefs,
  flows,
  scopeDescriptions,
  saved,
}: {
  q: CardQuestion;
  wording: string | null;
  answer: CardAnswerState;
  readOnly: boolean;
  verbatimOpen: boolean;
  onToggleVerbatim: () => void;
  onSetFlag: (flagged: boolean) => void;
  onSetReason: (v: string) => void;
  onSaveReason: () => void;
  flowRefs: string[];
  flows: Record<string, ProcessFlow>;
  scopeDescriptions: Record<string, string>;
  saved?: boolean;
}) {
  const flagged = answer.choice === "discuss";
  return (
    <article className="affirm-card rounded-card-warm border border-border-default bg-paper px-[22px] py-5 shadow-card">
      <header className="ac-head mb-2 flex items-center gap-2.5">
        <span className="ac-category text-sm font-semibold text-ink-soft">
          {q.sapTopic ?? "General"}
        </span>
        <span className="fmt-badge information rounded-pill bg-ink-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft">
          Information
        </span>
        {q.isCustom && (
          <span className="rounded-pill bg-navy/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-navy">
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

      <div className="info-input mb-3">
        <label className="l block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
          Your answer
        </label>
        <textarea
          value={answer.reason}
          onChange={(e) => onSetReason(e.target.value)}
          onBlur={onSaveReason}
          disabled={readOnly}
          rows={3}
          maxLength={2000}
          aria-label={`Your answer for ${q.id}`}
          placeholder="Type your answer here — e.g. list the items, describe your setup…"
          className="textarea mt-1 w-full rounded-input border border-border-default bg-paper p-2.5 text-sm focus:border-navy focus:outline-none"
        />
      </div>

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
              <span className="label block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
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

      <div className="choice-row info-flag-wrap flex items-start gap-3">
        <div className="choice-wrap min-w-[200px]">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onSetFlag(!flagged)}
            aria-pressed={flagged}
            className={`choice cfg inline-flex h-9 items-center justify-center gap-1.5 rounded-pill border px-3.5 text-xs font-semibold transition ${
              flagged
                ? "border-decision-configure bg-decision-configure text-white"
                : "border-border-default bg-paper text-ink-soft hover:border-border-strong hover:bg-ink-tint"
            } ${readOnly ? "cursor-not-allowed opacity-70" : ""}`}
          >
            {flagged ? "Flagged for workshop" : "Flag for workshop discussion"}
          </button>
          <p className="choice-help mt-1 text-[11px] leading-4 text-ink-muted">
            Use if you would rather cover this live.
          </p>
        </div>
      </div>

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
