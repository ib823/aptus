'use client';

/**
 * Client wrapper around the bundle-creation form.
 *
 * Intercepts the native HTML form submit, fetches the API with
 * Accept: application/json, and either:
 *   - on success: navigates to the returned redirectPath (full page nav,
 *     so the new bundle dashboard renders with fresh data from prisma)
 *   - on error: stays on the form, shows the server's error message
 *     inline at the top, preserves every field value (no state loss)
 *
 * The form CHILDREN are rendered by the server component (page.tsx).
 * They're inert JSX passed through {children}, which means assessments
 * data and scope catalog stay server-side.
 */

import { useRef, useState } from 'react';

interface Props {
  children: React.ReactNode;
}

interface ErrorPayload {
  code: string;
  message?: string;
}

export function BundleCreateForm({ children }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [error, setError] = useState<ErrorPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!formRef.current) return;
    setSubmitting(true);
    setError(null);

    const fd = new FormData(formRef.current);
    // Capture which submit button fired (action=send vs action=save_draft)
    // — FormData does not include submit buttons unless we add them.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) fd.set(submitter.name, submitter.value);

    try {
      const res = await fetch('/api/presales/bundles', {
        method: 'POST',
        body: fd,
        headers: { Accept: 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirectPath?: string;
        error?: ErrorPayload;
      };
      if (!res.ok) {
        setError(
          data.error ?? {
            code: `HTTP_${res.status}`,
            message: 'Submission failed. Please try again or contact support.',
          },
        );
        setSubmitting(false);
        return;
      }
      if (data.redirectPath) {
        window.location.assign(data.redirectPath);
        return;
      }
      setSubmitting(false);
    } catch (err) {
      setError({
        code: 'NETWORK_ERROR',
        message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      });
      setSubmitting(false);
    }
  }

  return (
    <form
      ref={formRef}
      method="POST"
      action="/api/presales/bundles"
      onSubmit={onSubmit}
      style={{ display: 'grid', gap: 24 }}
    >
      {error ? (
        <div
          role="alert"
          style={{
            background: '#FCEBEB',
            color: '#791F1F',
            border: '1px solid #E8B4B4',
            borderRadius: 8,
            padding: '12px 16px',
            fontSize: 14,
          }}
        >
          <div style={{ fontWeight: 600 }}>{error.message ?? error.code}</div>
          <div style={{ fontSize: 12, color: '#5A5A5A', marginTop: 4, fontFamily: 'Consolas, monospace' }}>
            {error.code}
          </div>
        </div>
      ) : null}

      <fieldset
        disabled={submitting}
        style={{ display: 'grid', gap: 24, border: 'none', padding: 0, margin: 0 }}
      >
        {children}
      </fieldset>
    </form>
  );
}
