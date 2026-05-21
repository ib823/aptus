'use client';

/**
 * Client wrapper around a single decision card on /c/s/[scopeCode].
 *
 * Server renders the static scaffold (title, sscui, summary, "Show
 * options" details). This component owns the interactive choice + the
 * multi-stakeholder safety UX:
 *
 *   - Sends saves as JSON to /c/decisions with expectedRowId so the
 *     server can reject silent overwrites.
 *   - On 409 STALE_WRITE, renders an in-card conflict banner naming the
 *     other reviewer and showing their value. Offers two explicit
 *     choices — "Reload latest" or "Keep my change anyway".
 *   - On success, replaces the in-memory expectedRowId with the new
 *     server-assigned rowId so the next save continues to be
 *     concurrency-safe.
 *
 * Audit & business logic are unchanged from the classic HTML form path
 * — the same /c/decisions POST handler writes the same
 * decision_changed / decision_set events. The only new server behavior
 * is the optional 409 path when expectedRowId mismatches.
 */

import { useState, useTransition } from 'react';
import { InlineErrorBanner } from '@/components/ui/inline-error-banner';
import { RelativeTime } from '@/components/ui/relative-time';

type Choice = 'std' | 'cfg' | 'cst';

const CHOICE_LABEL: Record<string, string> = {
  open: 'Open',
  std: 'Standard',
  cfg: 'Configure',
  cst: 'Custom',
};

interface CurrentValue {
  /** rowId of the current PresalesBundleDecision row, or empty string
   * when the decision has never been set (draft fallback). The server
   * compares this against the live state on every save. */
  rowId: string;
  choice: string;
  /** Human-friendly name of whoever last set the choice (or the bundle
   * creator for the draft fallback). */
  setByName: string;
  /** ISO timestamp; falls back to the bundle creation date for the
   * draft fallback. */
  setAtIso: string;
  /** True when the value being shown is the never-touched fallback
   * ("drafted by your consultant") rather than a concrete reviewer
   * decision. Drives the wording of the attribution line. */
  isDraftFallback: boolean;
}

interface Conflict {
  current: {
    rowId: string;
    choice: string;
    setByName: string;
    setAtIso: string;
  };
  /** The choice the reviewer was trying to set when the conflict was
   * detected — preserved so "Keep my change anyway" can resend it. */
  attemptedChoice: Choice;
}

interface Props {
  scopeCode: string;
  decisionId: string;
  sscui: string;
  title: string;
  summary: string;
  stdDesc: string;
  cfgDesc: string;
  cstDesc: string;
  initial: CurrentValue;
  /** True iff bundle is signed — read-only mode, no interactive form. */
  bundleSigned: boolean;
}

export function DecisionCardClient(props: Props) {
  const [value, setValue] = useState<CurrentValue>(props.initial);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function submit(choice: Choice, opts: { forceOverride?: boolean } = {}) {
    setTransientError(null);
    setConflict(null);
    const expectedRowId = opts.forceOverride ? '' : value.rowId;
    try {
      const res = await fetch('/c/decisions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          scopeCode: props.scopeCode,
          decisionId: props.decisionId,
          choice,
          notes: '',
          expectedRowId,
        }),
      });

      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          rowId?: string;
        };
        // After our own save, attribution becomes "set just now by you".
        // We don't know the reviewer's own displayName client-side — the
        // server will show the correct name on the next full page load.
        // Until then, use "you" as the friendly stand-in.
        setValue({
          rowId: typeof json.rowId === 'string' ? json.rowId : value.rowId,
          choice,
          setByName: 'you',
          setAtIso: new Date().toISOString(),
          isDraftFallback: false,
        });
        return;
      }

      if (res.status === 409) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: {
            code?: string;
            message?: string;
            current?: {
              rowId: string;
              choice: string;
              setAt: string;
              setByName: string;
            } | null;
          };
        };
        if (json.error?.code === 'STALE_WRITE' && json.error.current) {
          const c = json.error.current;
          setConflict({
            current: {
              rowId: c.rowId,
              choice: c.choice,
              setByName: c.setByName,
              setAtIso: c.setAt,
            },
            attemptedChoice: choice,
          });
          // Also reflect the *current* server state locally so the
          // attribution line below the choice buttons updates.
          setValue({
            rowId: c.rowId,
            choice: c.choice,
            setByName: c.setByName,
            setAtIso: c.setAt,
            isDraftFallback: false,
          });
          return;
        }
        setTransientError(
          json.error?.message ?? 'Could not save — please reload.',
        );
        return;
      }

      const text = await res.text().catch(() => '');
      setTransientError(
        `Save failed (${res.status}). ${text.slice(0, 160) || ''}`,
      );
    } catch (err) {
      setTransientError(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const onChoose = (choice: Choice) => {
    startTransition(() => {
      void submit(choice);
    });
  };

  const onKeepMine = () => {
    if (!conflict) return;
    const attempted = conflict.attemptedChoice;
    startTransition(() => {
      void submit(attempted, { forceOverride: true });
    });
  };

  const onReloadLatest = () => {
    // Hard reload so the server-rendered state replaces every in-memory
    // marker (other decisions on the page may also have changed).
    if (typeof window !== 'undefined') window.location.reload();
  };

  return (
    <li
      style={{
        background: 'var(--surface-paper)',
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontFamily:
            'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          color: 'var(--ink-muted)',
        }}
      >
        {props.sscui}
      </div>
      <h3
        style={{
          fontFamily: 'var(--font-serif), Georgia, serif',
          fontSize: 18,
          fontWeight: 500,
          margin: '4px 0',
          color: 'var(--ink-primary)',
        }}
      >
        {props.title}
      </h3>
      <p
        style={{
          margin: '8px 0',
          fontSize: 14,
          color: 'var(--ink-secondary)',
          lineHeight: 1.5,
        }}
      >
        {props.summary}
      </p>

      <div
        data-testid={`current-choice-${props.decisionId}`}
        style={{ fontSize: 13, marginTop: 8 }}
      >
        Current choice:{' '}
        <strong>{CHOICE_LABEL[value.choice] ?? value.choice}</strong>
      </div>

      {/* Attribution line — "set by X · 2 hours ago / 2026-05-21 04:32:11" */}
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          color: 'var(--ink-muted)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>
          {value.isDraftFallback ? 'Drafted by' : 'Set by'}{' '}
          <strong style={{ color: 'var(--ink-secondary)', fontWeight: 600 }}>
            {value.setByName}
          </strong>{' '}
          ·
        </span>
        <RelativeTime iso={value.setAtIso} compact />
      </div>

      {props.bundleSigned ? (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: 'var(--ink-muted)',
            fontStyle: 'italic',
          }}
        >
          Read-only — bundle signed.
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            opacity: pending ? 0.6 : 1,
            pointerEvents: pending ? 'none' : 'auto',
          }}
        >
          {(['std', 'cfg', 'cst'] as const).map((choiceKey) => (
            <button
              key={choiceKey}
              type="button"
              onClick={() => onChoose(choiceKey)}
              disabled={pending}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                background:
                  value.choice === choiceKey
                    ? 'var(--brand-navy)'
                    : 'var(--surface-paper)',
                color:
                  value.choice === choiceKey
                    ? '#FFFFFF'
                    : 'var(--ink-primary)',
                cursor: pending ? 'not-allowed' : 'pointer',
                fontWeight: value.choice === choiceKey ? 600 : 500,
              }}
            >
              {CHOICE_LABEL[choiceKey]}
            </button>
          ))}
        </div>
      )}

      {conflict ? (
        <div style={{ marginTop: 12 }}>
          <InlineErrorBanner
            message={`${conflict.current.setByName} just set this to "${CHOICE_LABEL[conflict.current.choice] ?? conflict.current.choice}". Reload to see the latest, or keep your "${CHOICE_LABEL[conflict.attemptedChoice]}" anyway.`}
            code="STALE_WRITE"
          />
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 8,
            }}
          >
            <button
              type="button"
              onClick={onReloadLatest}
              disabled={pending}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                background: 'var(--brand-navy)',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 8,
                cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              Reload latest
            </button>
            <button
              type="button"
              onClick={onKeepMine}
              disabled={pending}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 600,
                background: 'var(--surface-paper)',
                color: 'var(--cta-red)',
                border: '1px solid var(--cta-red)',
                borderRadius: 8,
                cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              Keep my change anyway
            </button>
          </div>
        </div>
      ) : null}

      {transientError ? (
        <div style={{ marginTop: 12 }}>
          <InlineErrorBanner message={transientError} />
        </div>
      ) : null}

      <details style={{ marginTop: 12 }}>
        <summary
          style={{
            cursor: 'pointer',
            fontSize: 13,
            color: 'var(--ink-secondary)',
          }}
        >
          Show options
        </summary>
        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gap: 8,
            fontSize: 13,
            color: 'var(--ink-secondary)',
            lineHeight: 1.5,
          }}
        >
          <div>
            <strong>Standard:</strong> {props.stdDesc}
          </div>
          <div>
            <strong>Configure:</strong> {props.cfgDesc}
          </div>
          <div>
            <strong>Custom:</strong> {props.cstDesc}
          </div>
        </div>
      </details>
    </li>
  );
}
