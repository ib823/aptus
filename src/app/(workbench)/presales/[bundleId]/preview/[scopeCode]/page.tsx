/**
 * Preview-as-client — /presales/[bundleId]/preview/[scopeCode].
 *
 * CRITICAL CORRECTNESS: this page MUST use the EXACT same redaction code
 * path that the real client gets at /c/s/[scopeCode]. If the redaction
 * leaks here, the client would see the same leak. The redaction test
 * (tests/e2e/preview-redaction.consultant.spec.ts) walks the rendered
 * hydration JSON with the same assertions as the external test.
 *
 * Differences from /c/s/[scopeCode]:
 *   - No session cookie required — this surface is authenticated via the
 *     portal middleware (consultant-side auth).
 *   - Sticky non-dismissable banner at the top.
 *   - All export and sign buttons render as "Disabled in preview".
 *
 * Bear in mind the consultant's OTP/grant state is irrelevant here; we
 * just want to show what a fresh client would see.
 */

import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import {
  getDecisionStatesForExternal,
  getScopeItemForExternal,
} from '@/lib/presales/redaction';
import { canPerformPresalesAction } from '@/lib/presales/rbac';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ bundleId: string; scopeCode: string }>;
}

export default async function PresalesPreviewAsClient({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canPerformPresalesAction(user.role, 'preview_as_client')) redirect('/presales');

  const { bundleId, scopeCode } = await params;
  const bundle = await prisma.presalesBundle.findFirst({
    where: { id: bundleId, ...(user.organizationId ? { organizationId: user.organizationId } : {}) },
    select: { id: true, clientCompanyName: true, defaultScopeCode: true, scopeCodes: true, signedAt: true },
  });
  if (!bundle) notFound();

  const item = await getScopeItemForExternal(prisma, scopeCode, bundle.id);
  if (!item) notFound();

  const decisionStates = await getDecisionStatesForExternal(prisma, scopeCode, bundle.id);
  const CHOICE_LABELS: Record<string, string> = {
    open: 'Open',
    std: 'Standard',
    cfg: 'Configure',
    cst: 'Custom',
  };

  return (
    <>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: '#FAEEDA',
          color: '#633806',
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 600,
          textAlign: 'center',
          borderBottom: '1px solid #633806',
        }}
      >
        PREVIEW — NOT A CLIENT SESSION. Actions are disabled. What you see here is what {bundle.clientCompanyName} would see.
      </div>
      <main style={{ maxWidth: 960, margin: '32px auto', padding: '0 24px' }}>
        <header style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 13, color: '#5A5A5A', marginBottom: 4 }}>
            {bundle.clientCompanyName}
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 600, margin: 0, color: '#002B5C' }}>
            {item.title}
          </h1>
          <div style={{ height: 2, background: '#002B5C', width: 64, marginTop: 12, marginBottom: 16 }} />
          <p style={{ margin: 0, color: '#5A5A5A' }}>{item.overview}</p>
        </header>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Decisions</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {item.decisions.map((d) => {
              const state = decisionStates.get(d.id);
              const currentChoice = state?.choice ?? 'open';
              return (
                <li
                  key={d.id}
                  style={{ background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 12, padding: 16, marginBottom: 12 }}
                >
                  <div style={{ fontSize: 12, color: '#5A5A5A' }}>{d.sscui}</div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, margin: '4px 0' }}>{d.title}</h3>
                  <p style={{ margin: '8px 0', fontSize: 14, color: '#5A5A5A' }}>{d.summary}</p>
                  <div data-testid={`current-choice-${d.id}`} style={{ fontSize: 13, marginTop: 8 }}>
                    Current choice: <strong>{CHOICE_LABELS[currentChoice] ?? currentChoice}</strong>
                  </div>
                  <div style={{ marginTop: 12, display: 'grid', gap: 8, fontSize: 13 }}>
                    <div><strong>Standard:</strong> {d.std_desc}</div>
                    <div><strong>Configure:</strong> {d.cfg_desc}</div>
                    <div><strong>Custom:</strong> {d.cst_desc}</div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: '#888780', fontStyle: 'italic' }}>
                    Disabled in preview — the real client sees these as choice buttons.
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Process steps</h2>
          <ol style={{ paddingLeft: 20, margin: 0 }}>
            {item.process_steps.map((step, i) => (
              <li key={`${step.name}-${i}`} style={{ marginBottom: 8, fontSize: 14 }}>
                <strong>{step.name}</strong> — {step.role} — {step.app}
                <div style={{ fontSize: 13, color: '#5A5A5A' }}>{step.expected}</div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
