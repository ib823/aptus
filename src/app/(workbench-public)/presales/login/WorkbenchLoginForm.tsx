'use client';

/**
 * Workbench sign-in form. Posts email to NextAuth email provider with
 * callbackUrl=/presales so the magic-link redirect lands the user on
 * the bundles index.
 *
 * On submit:
 *   - signIn('email', { email, callbackUrl: '/presales', redirect: false })
 *   - On success: show "Check your inbox" confirmation
 *   - On failure: inline error message, retry-able
 */

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export function WorkbenchLoginForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signIn('email', {
        email,
        callbackUrl: '/presales',
        redirect: false,
      });
      if (res?.error) {
        setError(
          res.error === 'AccessDenied'
            ? 'This email is not authorised for ABeam Workbench. Ask your ABeam admin for an invitation.'
            : 'We could not send the sign-in email. Check the address and try again.',
        );
        setBusy(false);
        return;
      }
      setSent(true);
      setBusy(false);
    } catch (err) {
      setError(`Network error: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div
          role="status"
          style={{
            background: '#E1F5EE',
            color: '#085041',
            border: '1px solid #B7E0CB',
            borderRadius: 8,
            padding: '14px 16px',
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Check your inbox</div>
          We sent a sign-in link to <strong>{email}</strong>. Click the link in that email to enter ABeam Workbench &mdash; there&rsquo;s no code to type. The link expires in 10 minutes.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: '#5A5A5A' }}>Wrong address, or didn&rsquo;t arrive?</span>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setError(null);
              setBusy(false);
            }}
            style={{
              background: '#FFFFFF',
              color: '#002B5C',
              border: '1px solid #002B5C',
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Use a different email
          </button>
        </div>
        <div style={{ fontSize: 12, color: '#888780', marginTop: 4 }}>
          Tip: check your spam / promotions folder. The sender is your team&rsquo;s configured EMAIL_FROM via Brevo SMTP.
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
      {error ? (
        <div
          role="alert"
          style={{
            background: '#FCEBEB',
            color: '#791F1F',
            border: '1px solid #E8B4B4',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#5A5A5A' }}>Work email</span>
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          placeholder="you@abeam.com"
          autoComplete="email"
          style={{
            padding: '10px 12px',
            border: '1px solid #E5E5E5',
            borderRadius: 8,
            fontSize: 14,
            outline: 'none',
            transition: 'border-color 120ms',
          }}
        />
      </label>
      <button
        type="submit"
        disabled={busy || !email}
        style={{
          background: '#C8102E',
          color: '#FFFFFF',
          border: 'none',
          padding: '12px 18px',
          fontSize: 14,
          fontWeight: 600,
          borderRadius: 8,
          cursor: busy || !email ? 'not-allowed' : 'pointer',
          opacity: busy || !email ? 0.6 : 1,
          transition: 'opacity 120ms, transform 120ms',
        }}
      >
        {busy ? 'Sending link…' : 'Continue'}
      </button>
    </form>
  );
}
