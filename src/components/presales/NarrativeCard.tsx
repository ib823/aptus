'use client';

/**
 * Narrative (free-text) card for the Business Overview questions in the
 * Enhanced Workbench. 4 of 28 in the O2C-Sales set.
 *
 * Reuses the same POST /c/decisions endpoint as decision cards. The
 * "choice" column stores 'cfg' (re-purposed to mean "narrative answered")
 * and the actual answer goes into notes.
 *
 * Auto-saves on blur to keep the flow uncluttered. Concurrency token
 * carried via expectedRowId same as the decision card.
 */

import { useState, useTransition } from 'react';
import { InlineErrorBanner } from '@/components/ui/inline-error-banner';
import { RelativeTime } from '@/components/ui/relative-time';

interface CurrentValue {
  rowId: string;
  notes: string;
  setByName: string;
  setAtIso: string;
  isDraftFallback: boolean;
}

interface Props {
  scopeCode: string;
  decisionId: string;
  title: string;
  question: string;
  initial: CurrentValue;
  bundleSigned: boolean;
}

export function NarrativeCard(props: Props) {
  const [value, setValue] = useState<CurrentValue>(props.initial);
  const [draftNotes, setDraftNotes] = useState(props.initial.notes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function save() {
    setError(null);
    if (draftNotes.trim() === value.notes.trim()) return;
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
          choice: 'cfg',
          notes: draftNotes,
          expectedRowId: value.rowId,
        }),
      });
      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as { rowId?: string };
        setValue({
          rowId: typeof json.rowId === 'string' ? json.rowId : value.rowId,
          notes: draftNotes,
          setByName: 'you',
          setAtIso: new Date().toISOString(),
          isDraftFallback: false,
        });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };
      setError(json.error?.message ?? `Save failed (${res.status}).`);
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--border-default, #E4E2DA)',
        borderLeft: '4px solid #002B5C',
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
      <div
        style={{
          marginTop: 7,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 11,
          color: '#8A93A0',
        }}
      >
        SAP source · L2 · Business Overview (narrative)
      </div>

      {props.bundleSigned ? (
        <div
          style={{
            marginTop: 9,
            background: '#F4F6F8',
            border: '1px solid #DDE3E9',
            borderRadius: 7,
            padding: '9px 11px',
            fontSize: 13,
            color: '#1A2230',
            lineHeight: 1.5,
          }}
        >
          {value.notes || (
            <span style={{ color: '#8A93A0', fontStyle: 'italic' }}>
              No answer recorded.
            </span>
          )}
        </div>
      ) : (
        <>
          <textarea
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            onBlur={() => startTransition(() => void save())}
            disabled={pending}
            rows={3}
            placeholder="Type your answer here. Saves on blur."
            style={{
              width: '100%',
              marginTop: 9,
              fontFamily: 'inherit',
              fontSize: 13,
              padding: '8px 10px',
              border: '1px solid #DDE3E9',
              borderRadius: 6,
              resize: 'vertical',
              color: '#1A2230',
              background: '#FFFFFE',
            }}
          />
        </>
      )}

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
          {value.isDraftFallback ? 'Awaiting' : 'Last edited by'}{' '}
          <strong style={{ color: '#566070', fontWeight: 600 }}>{value.setByName}</strong>{' '}
          ·
        </span>
        <RelativeTime iso={value.setAtIso} compact />
      </div>

      {error ? (
        <div style={{ marginTop: 8 }}>
          <InlineErrorBanner message={error} />
        </div>
      ) : null}
    </div>
  );
}
