/**
 * Bundle creation flow — /presales/new.
 *
 * Six numbered sections per Pass 7:
 *   1. Engagement (assessment link + internal name)
 *   2. Client presentation (client company name + accent color + logo URL)
 *   3. Scope items (multi-select from existing scope catalog)
 *   4. Stakeholders (recipient emails, marking one as signatory)
 *   5. Access window (starts at + expires at + acknowledgement text version)
 *   6. Legal (PDPA notice version, cross-border consent prompt visibility)
 *
 * Submit action posts to /api/presales/bundles which performs all
 * server-side validation, snapshots the scope content, creates grants
 * (token+OTP issued), and dispatches magic-link emails.
 *
 * RBAC: requires create_bundle.
 */

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { scopeCodes, scopeItems } from '@/lib/fts/data';
import { canPerformPresalesAction } from '@/lib/presales/rbac';
import { BundleCreateForm } from './BundleCreateForm';
import { StakeholderRows } from './StakeholderRows';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata = { title: { absolute: 'New bundle — ABeam Workbench' } };

export default async function PresalesNewBundlePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/presales/login');
  if (!canPerformPresalesAction(user.role, 'create_bundle')) redirect('/presales');

  const assessments = await prisma.assessment.findMany({
    where: { ...(user.organizationId ? { organizationId: user.organizationId } : {}), deletedAt: null },
    select: { id: true, companyName: true, industry: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <main style={{ maxWidth: 880, margin: '32px auto', padding: '0 24px' }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: '#5A5A5A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Workbench · New bundle
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: '4px 0 0', color: '#002B5C' }}>
          Create presales bundle
        </h1>
      </header>

      <BundleCreateForm>
        <Section index={1} title="Engagement">
          <Field label="Internal bundle name">
            <input
              name="name"
              required
              placeholder="Acme Corp — O2C Presales"
              style={inputStyle}
            />
          </Field>
          <Field label="Linked assessment">
            <select name="assessmentId" required style={inputStyle}>
              <option value="">Select an assessment…</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.companyName} · {a.industry}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section index={2} title="Client presentation">
          <Field label="Client company name (shown on landing)">
            <input name="clientCompanyName" required style={inputStyle} />
          </Field>
          <Field label="Client accent color (hex, optional)">
            <input name="clientAccentColor" placeholder="#1e40af" style={inputStyle} />
          </Field>
          <Field label="Client logo URL (optional)">
            <input name="clientLogoUrl" placeholder="https://..." style={inputStyle} />
          </Field>
        </Section>

        <Section index={3} title="Scope items">
          <div style={{ fontSize: 13, color: '#5A5A5A', marginBottom: 8 }}>
            Pick the scope items to include and mark one as the landing scope (what the client sees first). The bundle snapshots their content at creation; live library edits won&rsquo;t change this bundle.
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '40px 1fr 80px',
                gap: 12,
                padding: '4px 8px',
                fontSize: 11,
                color: '#888780',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                fontWeight: 600,
              }}
            >
              <span>Include</span>
              <span>Scope</span>
              <span style={{ textAlign: 'center' }}>Default</span>
            </div>
            {scopeCodes.map((code) => (
              <label
                key={code}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1fr 80px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '8px',
                  border: '1px solid #E5E5E5',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  name="scopeCodes"
                  value={code}
                  style={{ justifySelf: 'center' }}
                />
                <span>
                  <span style={{ fontWeight: 600 }}>{code}</span>{' '}
                  <span style={{ color: '#5A5A5A' }}>{scopeItems[code]?.title}</span>
                </span>
                <input
                  type="radio"
                  name="defaultScopeCode"
                  value={code}
                  required
                  style={{ justifySelf: 'center' }}
                  title="Set as the landing scope shown to the client first"
                />
              </label>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#888780', marginTop: 4 }}>
            The default scope must also be ticked &ldquo;Include&rdquo;.
          </div>
        </Section>

        <Section index={4} title="Stakeholders">
          <StakeholderRows />
        </Section>

        <Section index={5} title="Access window">
          <Field label="Starts at">
            <input name="startsAt" type="datetime-local" required style={inputStyle} />
          </Field>
          <Field label="Expires at">
            <input name="expiresAt" type="datetime-local" required style={inputStyle} />
          </Field>
          <Field label="Acknowledgement text version">
            <input name="acknowledgementTextVersion" required defaultValue="v1" style={inputStyle} />
          </Field>
        </Section>

        <Section index={6} title="Legal">
          <Field label="PDPA notice version">
            <input name="pdpaNoticeTextVersion" required defaultValue="v1" style={inputStyle} />
          </Field>
          <div style={{ fontSize: 13, color: '#5A5A5A' }}>
            Cross-border consent is requested per-grantee on the landing page. No bundle-level setting required.
          </div>
        </Section>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            type="submit"
            name="action"
            value="save_draft"
            style={{
              background: '#FFFFFF',
              color: '#002B5C',
              border: '1px solid #002B5C',
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Save as draft
          </button>
          <button
            type="submit"
            name="action"
            value="send"
            style={{
              background: '#C8102E',
              color: '#FFFFFF',
              border: 'none',
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Send invitations
          </button>
        </div>
      </BundleCreateForm>
    </main>
  );
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 12, padding: 24 }}>
      <header style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#5A5A5A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {String(index).padStart(2, '0')}
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '4px 0 0', color: '#1A1A1A' }}>{title}</h2>
      </header>
      <div style={{ display: 'grid', gap: 12 }}>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
      <span style={{ color: '#5A5A5A', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #E5E5E5',
  borderRadius: 8,
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
};
