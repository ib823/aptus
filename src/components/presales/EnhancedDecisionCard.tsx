'use client';

/**
 * Enhanced decision card for the BDC-style value-stream workbench
 * (e.g. Order-to-Cash — Sales). Replaces the legacy DecisionCardClient
 * when the catalog entry has value_stream === true.
 *
 * Layout matches curation-model/Enhanced-Workbench-Mockup.html:
 *   - Three response chips: Adopt SAP standard · Discuss in workshop ·
 *     We do this differently
 *   - Defaults to "Adopt SAP standard" — one tap to confirm
 *   - "We do this differently" reveals a required business-reason field;
 *     server rejects with DEVIATION_REASON_REQUIRED if blank
 *   - "Show SAP source" expander reveals SSCUI ID, scope refs, Level
 *   - Attribution and stale-write conflict UI carry over from the
 *     multi-stakeholder safety PR
 *
 * Mapping to existing PresalesBundleDecision.choice column:
 *   adopt    → 'std'
 *   discuss  → 'cfg'   (re-purposed; legacy "configure")
 *   deviate  → 'cst'   (re-purposed; legacy "custom")
 *   open     (unanswered)
 */

import { useState, useTransition } from 'react';
import { InlineErrorBanner } from '@/components/ui/inline-error-banner';
import { RelativeTime } from '@/components/ui/relative-time';

type Choice = 'std' | 'cfg' | 'cst';

const CHIP_LABEL: Record<Choice, string> = {
  std: 'Adopt SAP standard',
  cfg: 'Discuss in workshop',
  cst: 'We do this differently',
};

interface CurrentValue {
  rowId: string;
  choice: 'open' | Choice;
  notes: string;
  setByName: string;
  setAtIso: string;
  isDraftFallback: boolean;
}

interface Conflict {
  current: {
    rowId: string;
    choice: string;
    setByName: string;
    setAtIso: string;
  };
  attemptedChoice: Choice;
  attemptedNotes: string;
}

interface Props {
  scopeCode: string;
  decisionId: string;
  title: string;
  /** Plain-language question (consultant rephrase or SAP-verbatim fallback). */
  question: string;
  /** SAP-verbatim text shown in "Show SAP source". */
  sapVerbatim?: string | undefined;
  sscuiId?: string | undefined;
  sscuiName?: string | undefined;
  areaTopic: string;
  scopeItemRefs?: string[] | undefined;
  initial: CurrentValue;
  bundleSigned: boolean;
}

export function EnhancedDecisionCard(props: Props) {
  const [value, setValue] = useState<CurrentValue>(props.initial);
  const [draftChoice, setDraftChoice] = useState<Choice>(
    props.initial.choice === 'open' ? 'std' : (props.initial.choice as Choice),
  );
  const [draftNotes, setDraftNotes] = useState(props.initial.notes);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [pending, startTransition] = useTransition();

  // Only the deviate choice triggers the reason field. When the user
  // toggles away from deviate, drop any half-typed reason so it doesn't
  // get accidentally posted on the next save.
  const isDeviate = draftChoice === 'cst';

  async function submit(
    choice: Choice,
    notes: string,
    opts: { forceOverride?: boolean } = {},
  ) {
    setError(null);
    setConflict(null);
    if (choice === 'cst' && !notes.trim()) {
      setError('A short business reason is required when you choose "We do this differently".');
      return;
    }
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
          notes,
          expectedRowId,
        }),
      });
      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          rowId?: string;
        };
        setValue({
          rowId: typeof json.rowId === 'string' ? json.rowId : value.rowId,
          choice,
          notes,
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
            attemptedNotes: notes,
          });
          setValue({
            rowId: c.rowId,
            choice: c.choice as 'open' | Choice,
            notes: value.notes,
            setByName: c.setByName,
            setAtIso: c.setAt,
            isDraftFallback: false,
          });
          return;
        }
        if (json.error?.code === 'DEVIATION_REASON_REQUIRED') {
          setError(json.error.message ?? 'A short business reason is required.');
          return;
        }
        setError(json.error?.message ?? 'Could not save — please reload.');
        return;
      }
      const text = await res.text().catch(() => '');
      setError(`Save failed (${res.status}). ${text.slice(0, 160) || ''}`);
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const onPickChip = (choice: Choice) => {
    setDraftChoice(choice);
    if (choice !== 'cst') {
      // Auto-save on confirm / discuss — single-tap behavior per spec.
      startTransition(() => {
        void submit(choice, '');
      });
    }
  };

  const onSaveDeviate = () => {
    startTransition(() => {
      void submit('cst', draftNotes);
    });
  };

  const onKeepMine = () => {
    if (!conflict) return;
    const { attemptedChoice, attemptedNotes } = conflict;
    startTransition(() => {
      void submit(attemptedChoice, attemptedNotes, { forceOverride: true });
    });
  };

  const onReloadLatest = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  const accentForChoice = (c: string): string => {
    if (c === 'std') return '#0F766E'; // teal — adopt
    if (c === 'cfg') return '#1D4ED8'; // blue — discuss
    if (c === 'cst') return '#B45309'; // amber — deviate
    return '#C9C6BC'; // unanswered grey
  };

  const accentColor = accentForChoice(value.choice);

  return (
    <div
      style={{
        border: '1px solid var(--border-default, #E4E2DA)',
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: 9,
        padding: '13px 15px',
        marginBottom: 10,
        background: '#FFFFFE',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-serif), Georgia, serif',
          fontSize: 15,
          fontWeight: 600,
          color: '#1A2230',
        }}
      >
        {props.title}
      </div>
      <div
        style={{
          fontSize: 13,
          color: '#566070',
          marginTop: 4,
          lineHeight: 1.5,
        }}
      >
        {props.question}
      </div>

      <button
        type="button"
        onClick={() => setShowSource((v) => !v)}
        style={{
          marginTop: 7,
          background: 'none',
          border: 'none',
          padding: 0,
          fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
          fontSize: 11,
          color: '#8A93A0',
          cursor: 'pointer',
          textAlign: 'left',
        }}
        aria-expanded={showSource}
      >
        {props.sscuiId
          ? `SAP source · L2 · SSCUI ${props.sscuiId} · ${props.areaTopic} ${showSource ? '▾' : '▸'}`
          : `SAP source · L2 · ${props.areaTopic} (narrative) ${showSource ? '▾' : '▸'}`}
      </button>
      {showSource ? (
        <div
          style={{
            marginTop: 6,
            padding: 9,
            background: '#F4F6F8',
            border: '1px solid #DDE3E9',
            borderRadius: 6,
            fontSize: 12,
            color: '#1A2230',
            lineHeight: 1.5,
          }}
        >
          {props.sapVerbatim ? (
            <div>
              <strong>Verbatim SAP question:</strong> {props.sapVerbatim}
            </div>
          ) : null}
          {props.sscuiId ? (
            <div style={{ marginTop: 6 }}>
              <strong>SSCUI:</strong> {props.sscuiId} — {props.sscuiName}
            </div>
          ) : null}
          {props.scopeItemRefs && props.scopeItemRefs.length > 0 ? (
            <div style={{ marginTop: 6 }}>
              <strong>Applies to:</strong> {props.scopeItemRefs.join(', ')}
            </div>
          ) : null}
        </div>
      ) : null}

      {props.bundleSigned ? (
        <div style={{ marginTop: 11, fontSize: 12, color: '#8A93A0', fontStyle: 'italic' }}>
          Read-only — bundle signed.
        </div>
      ) : (
        <>
          <div
            style={{
              marginTop: 11,
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              opacity: pending ? 0.6 : 1,
              pointerEvents: pending ? 'none' : 'auto',
            }}
          >
            {(['std', 'cfg', 'cst'] as const).map((c) => {
              const selected = draftChoice === c;
              const bg = selected ? accentForChoice(c) : '#F6F5F0';
              const fg = selected ? '#FFFFFF' : '#9AA0A8';
              const border = selected ? accentForChoice(c) : '#E4E2DA';
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onPickChip(c)}
                  disabled={pending}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '5px 11px',
                    borderRadius: 6,
                    border: `1px solid ${border}`,
                    background: bg,
                    color: fg,
                    cursor: pending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {selected && c === 'std' ? '✓ ' : ''}
                  {CHIP_LABEL[c]}
                </button>
              );
            })}
            {value.choice === 'open' || (value.choice === 'std' && draftChoice === 'std') ? (
              <span
                style={{
                  display: 'inline-block',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#0F766E',
                  background: '#E6F2F0',
                  borderRadius: 4,
                  padding: '3px 8px',
                  marginLeft: 4,
                  alignSelf: 'center',
                }}
              >
                DEFAULT — ONE TAP TO CONFIRM
              </span>
            ) : null}
          </div>

          {isDeviate ? (
            <div
              style={{
                marginTop: 9,
                background: '#FBEEDF',
                border: '1px solid #EAD9C2',
                borderRadius: 7,
                padding: '9px 11px',
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  color: '#B45309',
                  textTransform: 'uppercase',
                }}
                htmlFor={`reason-${props.decisionId}`}
              >
                Business reason (required)
              </label>
              <textarea
                id={`reason-${props.decisionId}`}
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                disabled={pending}
                placeholder="Why does your business need this to differ from SAP standard?"
                rows={2}
                style={{
                  width: '100%',
                  marginTop: 4,
                  fontFamily: 'inherit',
                  fontSize: 13,
                  padding: '6px 8px',
                  border: '1px solid #EAD9C2',
                  borderRadius: 5,
                  resize: 'vertical',
                  background: '#FFFFFE',
                  color: '#1A2230',
                }}
              />
              <button
                type="button"
                onClick={onSaveDeviate}
                disabled={pending || !draftNotes.trim()}
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '6px 14px',
                  border: 'none',
                  borderRadius: 6,
                  background: draftNotes.trim() ? '#B45309' : '#D8C5A5',
                  color: '#FFFFFE',
                  cursor: pending || !draftNotes.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                Save deviation
              </button>
            </div>
          ) : null}
        </>
      )}

      {/* attribution */}
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: '#8A93A0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>
          {value.isDraftFallback ? 'Drafted by' : 'Set by'}{' '}
          <strong style={{ color: '#566070', fontWeight: 600 }}>{value.setByName}</strong>{' '}
          ·
        </span>
        <RelativeTime iso={value.setAtIso} compact />
      </div>

      {conflict ? (
        <div style={{ marginTop: 10 }}>
          <InlineErrorBanner
            message={`${conflict.current.setByName} just set this to "${CHIP_LABEL[conflict.current.choice as Choice] ?? conflict.current.choice}". Reload to see the latest, or keep your "${CHIP_LABEL[conflict.attemptedChoice]}" anyway.`}
            code="STALE_WRITE"
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            <button
              type="button"
              onClick={onReloadLatest}
              disabled={pending}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                background: '#002B5C',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 6,
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
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                background: '#FFFFFE',
                color: '#C8102E',
                border: '1px solid #C8102E',
                borderRadius: 6,
                cursor: pending ? 'not-allowed' : 'pointer',
              }}
            >
              Keep my change anyway
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 10 }}>
          <InlineErrorBanner message={error} />
        </div>
      ) : null}
    </div>
  );
}
