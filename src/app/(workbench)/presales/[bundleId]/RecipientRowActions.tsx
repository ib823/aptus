'use client';

/**
 * Per-recipient reissue button on the bundle dashboard.
 *
 * Renders a small "Reissue" button on each non-superseded grant. Click
 * reveals a confirm + optional email-correction input; submit posts to
 * /api/presales/grants/[grantId]/reissue and reloads the page.
 *
 * Grant rows that have already been superseded show "Superseded" in
 * place of the action — the dashboard server component decides which
 * branch to render via the `superseded` prop.
 */

import { useState } from 'react';

interface Props {
  grantId: string;
  currentEmail: string;
  bundleSigned: boolean;
  bundleRevoked: boolean;
  canReissue: boolean;
  superseded: boolean;
}

export function RecipientRowActions({
  grantId,
  currentEmail,
  bundleSigned,
  bundleRevoked,
  canReissue,
  superseded,
}: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (superseded) {
    return (
      <span style={{ fontSize: 11, color: '#888780' }}>Superseded</span>
    );
  }

  if (!canReissue) return null;
  if (bundleSigned || bundleRevoked) {
    return (
      <span style={{ fontSize: 11, color: '#888780' }} title="Reissue is not available once the bundle is signed or revoked">
        —
      </span>
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    if (email && email !== currentEmail) fd.set('email', email);
    try {
      const res = await fetch(`/api/presales/grants/${encodeURIComponent(grantId)}/reissue`, {
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
      window.location.reload();
    } catch (e) {
      setError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          fontSize: 11,
          padding: '3px 8px',
          border: '1px solid #002B5C',
          background: '#FFFFFF',
          color: '#002B5C',
          borderRadius: 4,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Reissue
      </button>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
      {error ? (
        <div style={{ color: '#791F1F', fontSize: 11 }}>{error}</div>
      ) : null}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        style={{
          padding: '4px 6px',
          fontSize: 12,
          border: '1px solid #E5E5E5',
          borderRadius: 4,
          width: 200,
        }}
      />
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          style={{
            fontSize: 11,
            padding: '3px 8px',
            background: '#C8102E',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {busy ? 'Reissuing…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setEmail(currentEmail);
          }}
          disabled={busy}
          style={{
            fontSize: 11,
            padding: '3px 8px',
            background: '#FFFFFF',
            color: '#5A5A5A',
            border: '1px solid #E5E5E5',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
