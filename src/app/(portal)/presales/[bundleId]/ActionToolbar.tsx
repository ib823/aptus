'use client';

/**
 * Bundle dashboard action toolbar.
 *
 * Three actions live here:
 *   - Extend window: opens an inline date picker. Posts to /extend.
 *   - Revoke: opens an inline reason field + confirm. Posts to /revoke.
 *   - (Per-grant reissue lives on each recipient row in the parent page,
 *      not here — kept separate so the toolbar doesn't need to know
 *      about grant ids.)
 *
 * Each form uses fetch with Accept: application/json so the page can
 * stay put on a 4xx (server returns { error: { code, message } }) and
 * display the failure inline rather than dumping to a raw JSON page.
 * On success, follow the returned redirectPath (which lands us back at
 * the same bundle dashboard with the new state visible).
 */

import { useState } from 'react';

interface Props {
  bundleId: string;
  currentExpiresAt: string;
  canExtend: boolean;
  canRevoke: boolean;
}

type Mode = 'idle' | 'extend' | 'revoke';

export function ActionToolbar({ bundleId, currentExpiresAt, canExtend, canRevoke }: Props) {
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(path: string, body: Record<string, string>) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(body)) fd.set(k, v);
    try {
      const res = await fetch(path, {
        method: 'POST',
        body: fd,
        headers: { Accept: 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirectPath?: string;
        error?: { code: string; message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? data.error?.code ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      if (data.redirectPath) {
        window.location.assign(data.redirectPath);
        return;
      }
      // Fallback: hard reload to pick up new state
      window.location.reload();
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {error ? (
        <div
          role="alert"
          style={{
            background: '#FCEBEB',
            color: '#791F1F',
            border: '1px solid #E8B4B4',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {canExtend ? (
          mode === 'extend' ? null : (
            <button
              type="button"
              onClick={() => {
                setMode('extend');
                setError(null);
              }}
              style={btn('secondary')}
            >
              Extend window
            </button>
          )
        ) : null}
        {canRevoke ? (
          mode === 'revoke' ? null : (
            <button
              type="button"
              onClick={() => {
                setMode('revoke');
                setError(null);
              }}
              style={btn('danger-outline')}
            >
              Revoke
            </button>
          )
        ) : null}
      </div>

      {mode === 'extend' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void submit(`/api/presales/bundles/${encodeURIComponent(bundleId)}/extend`, {
              newExpiresAt: String(fd.get('newExpiresAt') ?? ''),
            });
          }}
          style={panel}
        >
          <div style={panelHeading}>Extend window</div>
          <div style={{ fontSize: 12, color: '#5A5A5A' }}>
            Current expiry: <code>{currentExpiresAt}</code>. New expiry must be later and within 90 days from today.
          </div>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span>New expires-at</span>
            <input type="datetime-local" name="newExpiresAt" required style={inputStyle} />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy} style={btn('primary')}>
              {busy ? 'Extending…' : 'Confirm extend'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('idle');
                setError(null);
              }}
              disabled={busy}
              style={btn('secondary')}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {mode === 'revoke' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            void submit(`/api/presales/bundles/${encodeURIComponent(bundleId)}/revoke`, {
              reason: String(fd.get('reason') ?? ''),
            });
          }}
          style={{ ...panel, borderColor: '#E8B4B4', background: '#FFF8F8' }}
        >
          <div style={{ ...panelHeading, color: '#791F1F' }}>Revoke bundle</div>
          <div style={{ fontSize: 13, color: '#791F1F' }}>
            Revoking immediately blocks all in-flight guest sessions for this bundle. The action is not reversible — to reinstate, mint a new bundle. The audit log preserves the full history.
          </div>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
            <span>Reason (required, audited)</span>
            <textarea
              name="reason"
              required
              minLength={4}
              rows={3}
              placeholder="e.g. Stakeholder out of office, cycle paused for budget review"
              style={{ ...inputStyle, fontFamily: 'inherit' }}
            />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy} style={btn('danger')}>
              {busy ? 'Revoking…' : 'Confirm revoke'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('idle');
                setError(null);
              }}
              disabled={busy}
              style={btn('secondary')}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

const panel: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E5E5E5',
  borderRadius: 12,
  padding: 16,
  display: 'grid',
  gap: 10,
};
const panelHeading: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#1A1A1A',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};
const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #E5E5E5',
  borderRadius: 8,
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
};

function btn(variant: 'primary' | 'secondary' | 'danger' | 'danger-outline'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid transparent',
  };
  if (variant === 'primary')
    return { ...base, background: '#002B5C', color: '#FFFFFF', border: '1px solid #002B5C' };
  if (variant === 'danger')
    return { ...base, background: '#C8102E', color: '#FFFFFF', border: '1px solid #C8102E' };
  if (variant === 'danger-outline')
    return { ...base, background: '#FFFFFF', color: '#C8102E', border: '1px solid #C8102E' };
  return { ...base, background: '#FFFFFF', color: '#002B5C', border: '1px solid #002B5C' };
}
