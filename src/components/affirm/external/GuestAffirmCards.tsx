"use client";

/**
 * <GuestAffirmCards> — the external executive L2 surface: the in-context
 * affirm questions for one scope item. Reuses the shared DecisionCard/InfoCard
 * (no fork). Autosaves each answer to POST /a/answers (with the session CSRF
 * nonce header), shows calibrated qualitative notes on discuss/deviate, and a
 * sticky progress bar with a "next process" CTA on completion.
 */

import { useMemo, useState } from "react";
import type { GuestQuestion } from "@/lib/affirm/external/serializers";
import type { AffirmChoice } from "@/lib/affirm/types";
import { DecisionCard } from "@/components/affirm/cards/DecisionCard";
import { InfoCard } from "@/components/affirm/cards/InfoCard";
import type { CardAnswerState } from "@/components/affirm/cards/card-shared";
import { CALIBRATED_NOTES } from "@/lib/affirm/external/copy";

interface Props {
  questions: GuestQuestion[];
  initialAnswers: Array<{ questionId: string; choice: AffirmChoice; reason: string | null }>;
  csrfNonce: string;
  readOnly: boolean;
  scopeDescription: string;
  backHref: string;
  nextHref: string | null;
}

const NO_FLOWS = {};
const NO_SCOPE_DESC = {};

export function GuestAffirmCards({
  questions,
  initialAnswers,
  csrfNonce,
  readOnly,
  scopeDescription,
  backHref,
  nextHref,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, CardAnswerState>>(() => {
    const seed: Record<string, CardAnswerState> = {};
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
  const [verbatimOpen, setVerbatimOpen] = useState<Record<string, boolean>>({});
  const [touched, setTouched] = useState<Set<string>>(
    () => new Set(initialAnswers.map((a) => a.questionId)),
  );

  const answeredCount = useMemo(() => touched.size, [touched]);

  async function persist(questionId: string, choice: AffirmChoice, reason: string) {
    setAnswers((m) => ({ ...m, [questionId]: { ...m[questionId]!, saving: true, error: null } }));
    try {
      const res = await fetch("/a/answers", {
        method: "POST",
        headers: { "content-type": "application/json", "x-affirm-csrf": csrfNonce },
        body: JSON.stringify({
          questionId,
          choice,
          reason: choice === "deviate" ? reason : reason || null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `${res.status}`);
      }
      setAnswers((m) => ({
        ...m,
        [questionId]: { ...m[questionId]!, saving: false, dirty: false, error: null },
      }));
      setTouched((t) => new Set(t).add(questionId));
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

  function setDecisionChoice(q: GuestQuestion, choice: AffirmChoice) {
    if (readOnly) return;
    setAnswers((m) => ({ ...m, [q.id]: { ...m[q.id]!, choice, dirty: true } }));
    if (choice !== "deviate") void persist(q.id, choice, "");
  }
  function setInfoFlag(q: GuestQuestion, flagged: boolean) {
    if (readOnly) return;
    const choice: AffirmChoice = flagged ? "discuss" : "standard";
    setAnswers((m) => ({ ...m, [q.id]: { ...m[q.id]!, choice, dirty: true } }));
    void persist(q.id, choice, answers[q.id]?.reason ?? "");
  }
  function setReason(q: GuestQuestion, reason: string) {
    if (readOnly) return;
    setAnswers((m) => ({ ...m, [q.id]: { ...m[q.id]!, reason, dirty: true } }));
  }
  function saveReason(q: GuestQuestion) {
    const a = answers[q.id]!;
    if (q.format === "decision") {
      if (a.choice !== "deviate") return;
      if (!a.reason.trim()) {
        setAnswers((m) => ({ ...m, [q.id]: { ...m[q.id]!, error: "A reason is required." } }));
        return;
      }
      void persist(q.id, "deviate", a.reason.trim());
      return;
    }
    void persist(q.id, a.choice, a.reason);
  }

  const total = questions.length;
  const complete = answeredCount >= total && total > 0;

  return (
    <div className="space-y-4 pb-24">
      {questions.map((q) => {
        const a = answers[q.id]!;
        const wording = q.consultantWording ?? q.plainLanguageSuggested ?? q.sapVerbatim;
        return q.format === "information" ? (
          <InfoCard
            key={q.id}
            q={q}
            wording={wording}
            answer={a}
            readOnly={readOnly}
            verbatimOpen={!!verbatimOpen[q.id]}
            onToggleVerbatim={() => setVerbatimOpen((m) => ({ ...m, [q.id]: !m[q.id] }))}
            onSetFlag={(f) => setInfoFlag(q, f)}
            onSetReason={(v) => setReason(q, v)}
            onSaveReason={() => saveReason(q)}
            flowRefs={[]}
            flows={NO_FLOWS}
            scopeDescriptions={NO_SCOPE_DESC}
            saved={!readOnly && touched.has(q.id)}
          />
        ) : (
          <DecisionCard
            key={q.id}
            q={q}
            wording={wording}
            answer={a}
            readOnly={readOnly}
            verbatimOpen={!!verbatimOpen[q.id]}
            onToggleVerbatim={() => setVerbatimOpen((m) => ({ ...m, [q.id]: !m[q.id] }))}
            onSetChoice={(c) => setDecisionChoice(q, c)}
            onSetReason={(v) => setReason(q, v)}
            onSaveReason={() => saveReason(q)}
            flowRefs={[]}
            flows={NO_FLOWS}
            scopeDescriptions={NO_SCOPE_DESC}
            calibratedNotes={CALIBRATED_NOTES}
            saved={!readOnly && touched.has(q.id)}
          />
        );
      })}

      {questions.length === 0 && (
        <p className="rounded-card-warm border border-border-default bg-paper px-5 py-6 text-sm text-ink-muted">
          There are no questions on this process for you.
        </p>
      )}

      {/* Sticky progress + next CTA */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border-default bg-paper/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <div className="min-w-0 flex-1">
            <div
              className="flex h-1.5 overflow-hidden rounded-pill bg-ink-tint"
              role="progressbar"
              aria-valuenow={answeredCount}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-label="Questions answered on this process"
            >
              <span
                className="block h-full bg-decision-standard transition-all"
                style={{ width: total ? `${(answeredCount / total) * 100}%` : "0%" }}
              />
            </div>
            <p className="mt-1 text-[11px] text-ink-muted" aria-live="polite">
              {answeredCount} of {total} answered · {scopeDescription}
            </p>
          </div>
          {complete && nextHref ? (
            <a
              href={nextHref}
              className="shrink-0 rounded-input bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-hover"
            >
              Next process →
            </a>
          ) : (
            <a
              href={backHref}
              className="shrink-0 rounded-input border border-border-default px-4 py-2 text-sm font-medium text-ink-soft hover:text-ink"
            >
              Back
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
