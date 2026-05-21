/**
 * Post-signoff change request — /presales/[bundleId]/change-request.
 *
 * Only renders when bundle.signedAt is set (otherwise redirect to the bundle
 * dashboard). The form captures a description; submission writes a
 * ChangeRequest row tied to the assessment and audits the action.
 *
 * v1 scope: capture and audit only. Routing the request to the consultant's
 * review queue is a follow-up.
 */

import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import {
  canAccessPresales,
  canPerformPresalesAction,
} from '@/lib/presales/rbac';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ bundleId: string }>;
}

export const metadata = { title: { absolute: 'Change request — ABeam Workbench' } };

export default async function PresalesChangeRequestPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canAccessPresales(user.role)) redirect('/dashboard');

  const { bundleId } = await params;
  const bundle = await prisma.presalesBundle.findFirst({
    where: { id: bundleId, ...(user.organizationId ? { organizationId: user.organizationId } : {}) },
    select: { id: true, clientCompanyName: true, signedAt: true, assessmentId: true },
  });
  if (!bundle) notFound();
  if (!bundle.signedAt) redirect(`/presales/${bundleId}`);

  const canSubmit = canPerformPresalesAction(user.role, 'submit_change_request');

  return (
    <main style={{ maxWidth: 720, margin: '32px auto', padding: '0 24px' }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: '#5A5A5A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Workbench · Post-signoff · Change request
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: '4px 0 0', color: '#002B5C' }}>
          {bundle.clientCompanyName}
        </h1>
        <p style={{ fontSize: 13, color: '#5A5A5A', marginTop: 8 }}>
          This bundle is signed and immutable. A change request triggers a new working session — the original signed PDF is preserved as the historical record.
        </p>
      </header>

      <form method="POST" action="/api/presales/change-requests" style={{ background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 12, padding: 24, display: 'grid', gap: 16 }}>
        <input type="hidden" name="bundleId" value={bundle.id} />
        <input type="hidden" name="assessmentId" value={bundle.assessmentId} />
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#5A5A5A' }}>What needs to change?</span>
          <textarea
            name="description"
            rows={6}
            required
            style={{ padding: 8, fontSize: 14, border: '1px solid #E5E5E5', borderRadius: 8, fontFamily: 'inherit' }}
            placeholder="Describe the requested change and the reason."
          />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#5A5A5A' }}>Priority</span>
          <select name="priority" defaultValue="standard" style={{ padding: 8, fontSize: 14, border: '1px solid #E5E5E5', borderRadius: 8 }}>
            <option value="standard">Standard</option>
            <option value="urgent">Urgent — affects SOW signature</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            background: canSubmit ? '#C8102E' : '#888780',
            color: '#FFFFFF',
            border: 'none',
            padding: '12px 24px',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 8,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            justifySelf: 'start',
          }}
        >
          {canSubmit ? 'Submit change request' : 'View only — cannot submit'}
        </button>
      </form>
    </main>
  );
}
