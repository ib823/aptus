"use client";

/**
 * Screen 2 — Client affirm cards. Refit to the "Enhancement Restored"
 * design's .affirm-card pattern:
 *
 *   - ac-head row: sub-process category (left), DEFAULT badge when the
 *     current pick is "standard", L2-NNN qid right-aligned in mono.
 *   - ac-question: plain-language wording, 15px ink-primary.
 *   - sap-verbatim box on ink-tint with the exact mono micro-label
 *     "SAP verbatim · source of truth · never overwritten".
 *   - ac-source line: "SAP BDC · Level 2 · {sscui}", mono ink-muted.
 *   - choice-row: three segmented choice chips with colored dots that
 *     fill in when active (teal / blue / amber).
 *   - reason-block in surface-banner-warn appears only on deviate.
 *   - flag-note (warn surface, leading triangle icon) appears for
 *     questions flagged as config-how-to.
 *
 * Top of screen carries a stat-strip and a stacked progress bar; the
 * sticky release-bar at the bottom shows the submit CTA and helper.
 */
import { useMemo, useState, useTransition } from "react";
import type { AffirmQuestionRow } from "@/lib/affirm/queries";
import type { AffirmChoice } from "@/lib/affirm/types";

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
}

interface AnswerState {
  choice: AffirmChoice;
  reason: string;
  dirty: boolean;
  saving: boolean;
  error: string | null;
}

const CHOICE_LABELS: Record<AffirmChoice, string> = {
  standard: "Adopt SAP standard",
  discuss: "Discuss in workshop",
  deviate: "We do this differently",
};

export function AffirmCardList({
  bundleId,
  client,
  streamName,
  questions,
  initialAnswers,
  readOnly = false,
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

  // Group: sub-process -> sap area -> [questions]
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

  // Scorecard
  const totals = useMemo(() => {
    let standard = 0;
    let discuss = 0;
    let deviate = 0;
    for (const a of Object.values(answers)) {
      if (a.choice === "standard") standard++;
      if (a.choice === "discuss") discuss++;
      if (a.choice === "deviate") deviate++;
    }
    return { standard, discuss, deviate, total: questions.length };
  }, [answers, questions.length]);

  const pct = (n: number) => (totals.total ? Math.round((n / totals.total) * 100) : 0);

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
          reason: choice === "deviate" ? reason : null,
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

  function setChoice(q: AffirmQuestionRow, choice: AffirmChoice) {
    if (readOnly) return;
    setAnswers((m) => ({
      ...m,
      [q.id]: { ...m[q.id]!, choice, dirty: true },
    }));
    if (choice !== "deviate") {
      void persist(q.id, choice, "");
    }
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
    if (!a.reason.trim()) {
      setAnswers((m) => ({
        ...m,
        [q.id]: { ...m[q.id]!, error: "A reason is required." },
      }));
      return;
    }
    void persist(q.id, "deviate", a.reason.trim());
  }

  async function submit() {
    setSubmitError(null);
    const missing = Object.entries(answers).filter(
      ([, a]) => a.choice === "deviate" && !a.reason.trim(),
    );
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
          Fit-to-Standard pre-workshop affirmation
        </p>
        <h1 className="font-serif text-3xl leading-10 text-ink">
          {client} · {streamName}
        </h1>
        <p className="mt-1.5 max-w-[720px] text-sm text-ink-soft">
          {questions.length} Level-2 question{questions.length === 1 ? "" : "s"} across
          this stream. Your consultant will review your answers before they reach the
          workshop agenda &mdash; nothing is final until they release.
        </p>
      </div>

      {/* Stat-strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat n={totals.total} l="Affirm questions" />
        <Stat n={totals.standard} l="Adopt standard" tone="std" />
        <Stat n={totals.discuss} l="Discuss in workshop" tone="cfg" />
        <Stat n={totals.deviate} l="We differ" tone="cust" />
      </div>

      {/* Stacked progress bar */}
      <div>
        <div
          className="flex h-2 overflow-hidden rounded-pill bg-ink-tint"
          aria-label="Choices breakdown"
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
            <h3 className="mt-4 mb-1.5 border-b border-border-default pb-2 font-serif text-xl text-navy">
              {g.subProcessName}
            </h3>

            {Array.from(g.areas.entries()).map(([areaName, qs]) => (
              <div key={areaName}>
                <div className="mt-4 mb-2.5 inline-flex h-[26px] items-center rounded-pill bg-ink-tint px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-soft">
                  {areaName}
                </div>
                <div className="space-y-3">
                  {qs.map((q) => {
                    const a = answers[q.id]!;
                    const wording =
                      q.consultantWording ?? q.plainLanguageSuggested ?? q.sapVerbatim;
                    const isDefaultStd = a.choice === "standard";
                    return (
                      <article
                        key={q.id}
                        className="rounded-card-warm border border-border-default bg-paper px-[22px] py-5 shadow-card"
                      >
                        <header className="mb-2 flex items-center gap-2.5">
                          <span className="text-sm font-semibold text-ink-soft">
                            {q.sapTopic ?? areaName}
                          </span>
                          {isDefaultStd && (
                            <span className="inline-flex h-[18px] items-center rounded-pill bg-decision-standard/15 px-[7px] text-[9px] font-bold uppercase tracking-[0.06em] text-decision-standard">
                              default
                            </span>
                          )}
                          <span className="ml-auto font-mono text-[11px] text-ink-muted">
                            {q.id}
                          </span>
                        </header>

                        <p className="mb-3 text-[15px] leading-[22px] text-ink">
                          {wording}
                        </p>

                        {q.sapVerbatim && (
                          <div className="mb-2.5 rounded-input bg-ink-tint px-3.5 py-2.5">
                            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
                              SAP verbatim · source of truth · never overwritten
                            </span>
                            <span className="mt-1 block text-xs leading-[18px] text-ink-soft">
                              {q.sapVerbatim}
                            </span>
                          </div>
                        )}

                        <p className="mb-3 font-mono text-[11px] text-ink-muted">
                          SAP BDC · Level 2{q.sapArea ? ` · ${q.sapArea}` : ""}
                          {q.sscuiRef && q.sscuiRef !== "-" && q.sscuiRef !== "N/A"
                            ? ` · ${q.sscuiRef}`
                            : ""}
                        </p>

                        <div
                          className="flex flex-wrap gap-2"
                          role="radiogroup"
                          aria-label={`Your choice for ${q.id}`}
                        >
                          {(["standard", "discuss", "deviate"] as const).map((c) => {
                            const selected = a.choice === c;
                            const tone =
                              c === "standard"
                                ? "std"
                                : c === "discuss"
                                  ? "cfg"
                                  : "cust";
                            const onCls =
                              tone === "std"
                                ? "bg-decision-standard text-white border-decision-standard"
                                : tone === "cfg"
                                  ? "bg-decision-configure text-white border-decision-configure"
                                  : "bg-decision-custom text-white border-decision-custom";
                            const dotCls = selected
                              ? "bg-white/90"
                              : tone === "std"
                                ? "bg-decision-standard"
                                : tone === "cfg"
                                  ? "bg-decision-configure"
                                  : "bg-decision-custom";
                            return (
                              <button
                                key={c}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                disabled={readOnly}
                                onClick={() => setChoice(q, c)}
                                className={`inline-flex h-8 items-center gap-1.5 rounded-pill border px-3.5 text-xs font-semibold transition ${
                                  selected
                                    ? onCls
                                    : "border-border-default bg-paper text-ink-soft hover:border-border-strong hover:bg-ink-tint"
                                } ${readOnly ? "cursor-not-allowed opacity-70" : ""}`}
                              >
                                <span
                                  className={`block size-2 rounded-full ${dotCls}`}
                                  aria-hidden="true"
                                />
                                {CHOICE_LABELS[c]}
                              </button>
                            );
                          })}
                          {a.saving && (
                            <span className="self-center text-[11px] text-ink-muted">
                              saving…
                            </span>
                          )}
                          {a.error && (
                            <span className="self-center text-[11px] text-cta">
                              {a.error}
                            </span>
                          )}
                        </div>

                        {a.choice === "deviate" && (
                          <div className="mt-3 rounded-input border border-[#E5D6A8] bg-banner-warn px-3.5 py-2.5 text-[13px] leading-[19px]">
                            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-decision-custom">
                              Why we differ
                            </span>
                            <textarea
                              value={a.reason}
                              onChange={(e) => setReason(q, e.target.value)}
                              onBlur={() => saveReason(q)}
                              disabled={readOnly}
                              rows={3}
                              maxLength={2000}
                              placeholder="Required for a deviation."
                              className="w-full resize-y rounded border-0 bg-transparent text-ink focus:outline-none"
                            />
                          </div>
                        )}

                        {q.flag === "config-how-to" && (
                          <div className="mt-3 grid grid-cols-[16px_1fr] gap-2 rounded-input bg-banner-warn px-3 py-2 text-xs leading-[18px] text-ink-soft">
                            <svg
                              className="mt-0.5 text-[#8B5A00]"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <path d="M12 9v4M12 17h.01" />
                            </svg>
                            <div>
                              <strong className="text-ink">
                                L3 configuration · not a business decision.
                              </strong>{" "}
                              Reads more like a configuration setup step than a
                              business-affirm question. Your consultant will confirm
                              whether this belongs in the pre-workshop set.
                            </div>
                          </div>
                        )}
                      </article>
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
        <div className="sticky bottom-4 mt-7 flex items-center gap-4 rounded-card-warm border border-border-default bg-paper px-[22px] py-4 shadow-card-warm-hover">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-ink">
              All {totals.total} questions answered
            </div>
            <div className="mt-0.5 text-xs text-ink-muted">
              Your answers are sealed when submitted. The SAP verbatim text is retained
              on every item for audit. Your consultant reviews before anything is
              finalised.
            </div>
            {submitError && (
              <p className="mt-2 rounded-md border border-cta/40 bg-paper px-3 py-2 text-xs text-cta">
                {submitError}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2.5">
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-input bg-cta px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cta-hover disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit my affirmation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  n,
  l,
  tone,
}: {
  n: number;
  l: string;
  tone?: "std" | "cfg" | "cust";
}) {
  const cls =
    tone === "std"
      ? "text-decision-standard"
      : tone === "cfg"
        ? "text-decision-configure"
        : tone === "cust"
          ? "text-decision-custom"
          : "text-ink";
  return (
    <div className="rounded-card-warm border border-border-default bg-paper px-[18px] py-3.5">
      <p className={`font-serif text-[28px] leading-none font-medium ${cls}`}>{n}</p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
        {l}
      </p>
    </div>
  );
}
