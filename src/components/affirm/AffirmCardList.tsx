"use client";

/**
 * Screen 3 — Client affirm cards. v2 (CCC follow-up) refit.
 *
 * The four v2 changes that affect this component:
 *   §7 Each choice chip gets a one-line helper. A "How to answer" intro
 *      card sits above the cards.
 *   §8 Two question formats:
 *        DECISION    — 3 choices + "What 'Adopt SAP standard' means
 *                       here" teal box + "About this question" line.
 *        INFORMATION — open free-text answer + optional "Flag for
 *                       workshop discussion".
 *      SAP verbatim collapses by default on both (chevron toggle).
 *      "Adopt SAP standard" never appears on an Information card.
 *
 * Server-side: getAffirmSetForBundle returns each row with .format,
 * .enabled, .aboutText, .standardMeans. Disabled rows are already
 * filtered for the client view.
 */
import { useMemo, useState, useTransition } from "react";
import type { AffirmQuestionRow } from "@/lib/affirm/queries";
import type { AffirmChoice } from "@/lib/affirm/types";
import type { ProcessFlow } from "@/lib/affirm/process-flow";
import { Term } from "@/components/affirm/learn/TermChip";
import { DecisionCard } from "@/components/affirm/cards/DecisionCard";
import { InfoCard } from "@/components/affirm/cards/InfoCard";
import type { CardAnswerState } from "@/components/affirm/cards/card-shared";

interface Props {
  bundleId: string;
  client: string;
  streamName: string;
  questions: AffirmQuestionRow[];
  initialAnswers: Array<{
    questionId: string;
    choice: AffirmChoice;
    reason: string | null;
  }>;
  readOnly?: boolean;
  /** v2.1 §9: scope-item id → process flow. Drives <ProcessFlowStrip>. */
  flows?: Record<string, ProcessFlow>;
  /** v2.1 §9: scope-item id → description for the strip eyebrow tail. */
  scopeDescriptions?: Record<string, string>;
}

// The per-question answer state is the shared CardAnswerState. Information
// rows store their free-text answer on `reason` and use choice ∈ {standard
// ("no flag"), discuss ("flag for workshop")}; "deviate" is unused for them.
type AnswerState = CardAnswerState;

export function AffirmCardList({
  bundleId,
  client,
  streamName,
  questions,
  initialAnswers,
  readOnly = false,
  flows = {},
  scopeDescriptions = {},
}: Props) {
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => {
    const seed: Record<string, AnswerState> = {};
    for (const q of questions) {
      const existing = initialAnswers.find((a) => a.questionId === q.id);
      seed[q.id] = {
        choice: existing?.choice ?? "standard",
        reason: existing?.reason ?? "",
        dirty: false,
        saving: false,
        error: null,
      };
    }
    return seed;
  });

  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [expandedVerbatim, setExpandedVerbatim] = useState<Record<string, boolean>>({});

  function toggleVerbatim(id: string) {
    setExpandedVerbatim((m) => ({ ...m, [id]: !m[id] }));
  }

  // Group questions: sub-process -> sap area -> [questions]
  const groups = useMemo(() => {
    const m = new Map<
      string,
      {
        subProcessName: string;
        streamName: string;
        areas: Map<string, AffirmQuestionRow[]>;
      }
    >();
    for (const q of questions) {
      const k = q.subProcessId;
      const g =
        m.get(k) ??
        {
          subProcessName: q.subProcessName,
          streamName: q.streamName,
          areas: new Map<string, AffirmQuestionRow[]>(),
        };
      const a = q.sapArea ?? "General";
      const arr = g.areas.get(a) ?? [];
      arr.push(q);
      g.areas.set(a, arr);
      m.set(k, g);
    }
    return Array.from(m.entries());
  }, [questions]);

  // Scorecard counts — Decision only (Information rows are tallied
  // separately and aren't part of the std/discuss/deviate stack).
  const totals = useMemo(() => {
    let standard = 0;
    let discuss = 0;
    let deviate = 0;
    let info = 0;
    for (const q of questions) {
      const a = answers[q.id];
      if (!a) continue;
      if (q.format === "information") {
        info++;
        continue;
      }
      if (a.choice === "standard") standard++;
      if (a.choice === "discuss") discuss++;
      if (a.choice === "deviate") deviate++;
    }
    const decisionTotal = standard + discuss + deviate;
    return { standard, discuss, deviate, info, total: questions.length, decisionTotal };
  }, [answers, questions]);

  const pct = (n: number) =>
    totals.decisionTotal ? Math.round((n / totals.decisionTotal) * 100) : 0;

  async function persist(
    questionId: string,
    choice: AffirmChoice,
    reason: string,
  ) {
    setAnswers((m) => ({
      ...m,
      [questionId]: { ...m[questionId]!, saving: true, error: null },
    }));
    try {
      const res = await fetch(`/api/affirm/bundles/${bundleId}/responses`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId,
          choice,
          // For Information rows the free-text answer rides on `reason`.
          // For Decision rows reason is only sent on deviate.
          reason: choice === "deviate" ? reason : reason || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `${res.status}`);
      }
      setAnswers((m) => ({
        ...m,
        [questionId]: { ...m[questionId]!, saving: false, dirty: false, error: null },
      }));
    } catch (e) {
      setAnswers((m) => ({
        ...m,
        [questionId]: {
          ...m[questionId]!,
          saving: false,
          error: e instanceof Error ? e.message : "Save failed",
        },
      }));
    }
  }

  function setDecisionChoice(q: AffirmQuestionRow, choice: AffirmChoice) {
    if (readOnly) return;
    setAnswers((m) => ({
      ...m,
      [q.id]: { ...m[q.id]!, choice, dirty: true },
    }));
    if (choice !== "deviate") {
      void persist(q.id, choice, "");
    }
  }

  function setInfoFlag(q: AffirmQuestionRow, flagged: boolean) {
    if (readOnly) return;
    const newChoice: AffirmChoice = flagged ? "discuss" : "standard";
    setAnswers((m) => ({
      ...m,
      [q.id]: { ...m[q.id]!, choice: newChoice, dirty: true },
    }));
    void persist(q.id, newChoice, answers[q.id]?.reason ?? "");
  }

  function setReason(q: AffirmQuestionRow, reason: string) {
    if (readOnly) return;
    setAnswers((m) => ({
      ...m,
      [q.id]: { ...m[q.id]!, reason, dirty: true },
    }));
  }

  function saveReason(q: AffirmQuestionRow) {
    const a = answers[q.id]!;
    if (q.format === "decision") {
      if (a.choice !== "deviate") return;
      if (!a.reason.trim()) {
        setAnswers((m) => ({
          ...m,
          [q.id]: { ...m[q.id]!, error: "A reason is required." },
        }));
        return;
      }
      void persist(q.id, "deviate", a.reason.trim());
      return;
    }
    // Information: persist the free-text answer with the current
    // choice (standard / discuss-flag), reason carries the answer body.
    void persist(q.id, a.choice, a.reason);
  }

  async function submit() {
    setSubmitError(null);
    const missing = Object.entries(answers).filter(([qid, a]) => {
      const q = questions.find((x) => x.id === qid);
      if (!q || q.format !== "decision") return false;
      return a.choice === "deviate" && !a.reason.trim();
    });
    if (missing.length) {
      setSubmitError(
        `${missing.length} deviation${missing.length > 1 ? "s" : ""} need a reason before you can submit.`,
      );
      return;
    }
    startSubmit(async () => {
      const res = await fetch(`/api/affirm/bundles/${bundleId}/submit`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setSubmitError(j.error ?? `${res.status}`);
        return;
      }
      window.location.reload();
    });
  }

  return (
    <div className="space-y-6">
      {/* Page head */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
          <Term id="fit-to-standard">Fit-to-Standard</Term> pre-workshop affirmation
        </p>
        <h1 className="font-serif text-3xl leading-10 text-ink">
          {client} · {streamName}
        </h1>
        <p className="mt-1.5 max-w-[720px] text-sm text-ink-soft">
          {questions.length} question{questions.length === 1 ? "" : "s"} · your
          answers go to your ABeam consultant for review before reaching the
          workshop agenda. Nothing is final until they release it back to you.
        </p>
      </div>

      {/* Stat-strip — Decision colours + Information count */}
      <div className="stat-strip grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat n={totals.total} l="Questions" />
        <Stat n={totals.standard} l="Adopt standard" tone="std" />
        <Stat n={totals.discuss} l="Discuss" tone="cfg" />
        <Stat n={totals.deviate} l="We differ" tone="cust" />
        <Stat n={totals.info} l="Information" tone="muted" />
      </div>

      {/* Stacked progress (Decision only) */}
      {totals.decisionTotal > 0 && (
        <div>
          <div
            className="flex h-2 overflow-hidden rounded-pill bg-ink-tint"
            aria-label="Decision choices breakdown"
          >
            {totals.standard > 0 && (
              <span
                className="block h-full bg-decision-standard"
                style={{ width: `${pct(totals.standard)}%` }}
              />
            )}
            {totals.discuss > 0 && (
              <span
                className="block h-full bg-decision-configure"
                style={{ width: `${pct(totals.discuss)}%` }}
              />
            )}
            {totals.deviate > 0 && (
              <span
                className="block h-full bg-decision-custom"
                style={{ width: `${pct(totals.deviate)}%` }}
              />
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-3.5 text-[11px] text-ink-muted">
            <span>
              <span className="mr-1.5 inline-block size-2 rounded-full bg-decision-standard align-middle" />
              Adopt standard · {pct(totals.standard)}%
            </span>
            <span>
              <span className="mr-1.5 inline-block size-2 rounded-full bg-decision-configure align-middle" />
              Discuss · {pct(totals.discuss)}%
            </span>
            <span>
              <span className="mr-1.5 inline-block size-2 rounded-full bg-decision-custom align-middle" />
              Differ · {pct(totals.deviate)}%
            </span>
          </div>
        </div>
      )}

      {/* v2 §7: How to answer intro */}
      <div
        data-tour="affirm-howto"
        className="grid grid-cols-[20px_1fr] gap-3 rounded-card-warm border border-border-default bg-paper p-4 text-sm leading-5 text-ink-soft shadow-card"
      >
        <svg
          className="mt-px text-navy"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <div className="space-y-1.5">
          <p className="font-semibold text-ink">How to answer</p>
          <p>
            Each <Term id="decision-question"><strong>Decision</strong></Term> question shows
            what SAP&apos;s standard does — the teal box. If that works for you, keep{" "}
            <Term id="adopt-standard"><em>Adopt SAP standard</em></Term> (already selected).
            Pick <Term id="discuss-in-workshop"><em>Discuss in workshop</em></Term> if you are
            unsure, or <Term id="deviation"><em>We do this differently</em></Term> if you have
            a specific requirement — then add a short reason.
          </p>
          <p>
            <strong>Information</strong> questions have no standard to adopt — just
            provide your detail in the text box. You can flag any item for workshop
            discussion.
          </p>
        </div>
      </div>

      {readOnly && (
        <div className="grid grid-cols-[20px_1fr] gap-3 rounded-card-warm border border-[#BFD1E3] bg-status-sent-bg px-4 py-3 text-sm leading-5 text-status-sent-fg">
          <svg
            className="mt-px"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <div>
            <strong className="text-ink">Your answers are sealed.</strong> The consultant
            is reviewing before release.
          </div>
        </div>
      )}

      {/* Sub-process groups */}
      <div className="space-y-6">
        {groups.map(([subId, g]) => (
          <section key={subId}>
            <h3 className="subprocess-head mt-4 mb-1.5 border-b border-border-default pb-2 font-serif text-xl text-navy">
              {g.subProcessName}
            </h3>

            {Array.from(g.areas.entries()).map(([areaName, qs]) => (
              <div key={areaName}>
                <div className="category-band mt-4 mb-2.5 inline-flex h-[26px] items-center rounded-pill bg-ink-tint px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-soft">
                  {areaName}
                </div>
                <div className="space-y-3">
                  {qs.map((q) => {
                    const a = answers[q.id]!;
                    const wording =
                      q.consultantWording ?? q.plainLanguageSuggested ?? q.sapVerbatim;
                    // v2.1 §9: resolve question → flow via the first
                    // scopeItemRef. The data only supports the
                    // scope-item-level join (prompt's HONEST LIMIT);
                    // multiple refs land multiple strips.
                    const flowRefs = q.scopeItemRefs.filter((r) => flows[r] || scopeDescriptions[r]);
                    return q.format === "information" ? (
                      <InfoCard
                        key={q.id}
                        q={q}
                        wording={wording}
                        answer={a}
                        readOnly={readOnly}
                        verbatimOpen={!!expandedVerbatim[q.id]}
                        onToggleVerbatim={() => toggleVerbatim(q.id)}
                        onSetFlag={(flagged) => setInfoFlag(q, flagged)}
                        onSetReason={(v) => setReason(q, v)}
                        onSaveReason={() => saveReason(q)}
                        flowRefs={flowRefs}
                        flows={flows}
                        scopeDescriptions={scopeDescriptions}
                      />
                    ) : (
                      <DecisionCard
                        key={q.id}
                        q={q}
                        wording={wording}
                        answer={a}
                        readOnly={readOnly}
                        verbatimOpen={!!expandedVerbatim[q.id]}
                        onToggleVerbatim={() => toggleVerbatim(q.id)}
                        onSetChoice={(c) => setDecisionChoice(q, c)}
                        onSetReason={(v) => setReason(q, v)}
                        onSaveReason={() => saveReason(q)}
                        flowRefs={flowRefs}
                        flows={flows}
                        scopeDescriptions={scopeDescriptions}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      {/* Sticky release bar */}
      {!readOnly && (
        <div
          data-tour="affirm-submit"
          className="release-bar sticky bottom-4 mt-7 flex items-center gap-4 rounded-card-warm border border-border-default bg-paper px-[22px] py-4 shadow-card-warm-hover"
        >
          <div className="info min-w-0 flex-1">
            <div className="t text-sm font-semibold text-ink">
              All {totals.total} questions answered
            </div>
            <div className="s mt-0.5 text-xs text-ink-muted">
              Your answers are sealed when submitted. The SAP verbatim text is
              retained on every item for audit. Your consultant reviews before
              anything is finalised.
            </div>
            {submitError && (
              <p className="mt-2 rounded-md border border-cta/40 bg-paper px-3 py-2 text-xs text-cta">
                {submitError}
              </p>
            )}
          </div>
          <div className="actions flex shrink-0 gap-2.5">
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="btn primary md inline-flex h-10 items-center justify-center gap-1.5 rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit my affirmation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat tile (cards live in ./cards/) ─────────────────────────────

function Stat({
  n,
  l,
  tone,
}: {
  n: number;
  l: string;
  tone?: "std" | "cfg" | "cust" | "muted";
}) {
  const cls =
    tone === "std"
      ? "text-decision-standard"
      : tone === "cfg"
        ? "text-decision-configure"
        : tone === "cust"
          ? "text-decision-custom"
          : tone === "muted"
            ? "text-ink-muted"
            : "text-ink";
  return (
    <div className="stat rounded-card-warm border border-border-default bg-paper px-[18px] py-3.5">
      <p className={`n font-serif text-[28px] leading-none font-medium ${cls}`}>{n}</p>
      <p className="l mt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
        {l}
      </p>
    </div>
  );
}
