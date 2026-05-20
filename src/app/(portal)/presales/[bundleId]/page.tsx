/**
 * Bundle dashboard — /presales/[bundleId].
 *
 * Per Pass 7: status pill, action toolbar (Preview as client, Extend, Re-issue,
 * Revoke), decision scorecard WITH effort visible (consultant view — no
 * redaction), recipients list, recent activity feed.
 *
 * The decision scorecard reads PresalesBundleDecision rows DIRECTLY (NOT
 * through redaction.ts). See the asymmetry comment at the top of
 * src/lib/presales/redaction.ts.
 */

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import {
  canAccessPresales,
  canPerformPresalesAction,
} from '@/lib/presales/rbac';
import type { ScopeItemContent } from '@/lib/fts/types';
import { ActionToolbar } from './ActionToolbar';
import { RecipientRowActions } from './RecipientRowActions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ bundleId: string }>;
}

export default async function PresalesBundleDashboard({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canAccessPresales(user.role)) redirect('/dashboard');

  const { bundleId } = await params;
  const bundle = await prisma.presalesBundle.findFirst({
    where: { id: bundleId, ...(user.organizationId ? { organizationId: user.organizationId } : {}) },
    include: { grants: { orderBy: { createdAt: 'asc' } } },
  });
  if (!bundle) notFound();

  const decisions = await prisma.presalesBundleDecision.findMany({
    where: { bundleId, supersededAt: null },
    orderBy: { setAt: 'desc' },
  });
  const recentEvents = await prisma.presalesAuditEvent.findMany({
    where: { bundleId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const snapshot = bundle.contentSnapshotJson as unknown as ScopeItemContent[];

  const now = new Date();
  let status: string;
  if (bundle.signedAt) status = 'Signed';
  else if (bundle.revokedAt) status = 'Revoked';
  else if (bundle.expiresAt <= now) status = 'Expired';
  else status = 'Active';

  // Sum effort visible to consultants — DIRECT read of the IP-bearing
  // field (not redacted). This view never leaves the (portal) surface.
  let totalEffortDays = 0;
  for (const d of decisions) totalEffortDays += d.effortDays;

  const canRevoke = canPerformPresalesAction(user.role, 'revoke_bundle') && !bundle.signedAt && !bundle.revokedAt;
  const canExtend = canPerformPresalesAction(user.role, 'extend_bundle') && !bundle.signedAt && !bundle.revokedAt;

  return (
    <main style={{ maxWidth: 1280, margin: '32px auto', padding: '0 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: '#5A5A5A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Presales · {bundle.scopeCodes.join(' · ')}
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: '4px 0 0', color: '#002B5C' }}>
            {bundle.clientCompanyName}
          </h1>
          <div style={{ fontSize: 12, color: '#888780', marginTop: 4 }}>
            {bundle.name} · expires {bundle.expiresAt.toISOString().slice(0, 10)}
          </div>
        </div>
        <span style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, borderRadius: 999, background: '#F1EFE8', color: '#444441' }}>
          {status}
        </span>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <Link
          href={`/presales/${bundle.id}/preview/${encodeURIComponent(bundle.defaultScopeCode)}`}
          style={btn('secondary')}
        >
          Preview as client
        </Link>
        <Link href={`/presales/${bundle.id}/audit`} style={btn('secondary')}>
          Audit log
        </Link>
        {bundle.signedAt ? (
          <Link href={`/presales/${bundle.id}/change-request`} style={btn('primary')}>
            Submit change request
          </Link>
        ) : null}
      </div>

      <div style={{ marginBottom: 24 }}>
        <ActionToolbar
          bundleId={bundle.id}
          currentExpiresAt={bundle.expiresAt.toISOString()}
          canExtend={canExtend}
          canRevoke={canRevoke}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        <section style={card}>
          <h2 style={cardHeading}>Decision scorecard</h2>
          <div style={{ fontSize: 24, fontWeight: 600, color: '#002B5C', marginTop: 8 }}>
            {decisions.length}
            <span style={{ fontSize: 14, fontWeight: 400, color: '#5A5A5A', marginLeft: 8 }}>
              decisions recorded
            </span>
          </div>
          <div style={{ marginTop: 12, fontSize: 13, color: '#5A5A5A' }}>
            Total effort estimate: <strong>{totalEffortDays} days</strong>
          </div>
          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>Per-decision breakdown</summary>
            <table style={{ width: '100%', marginTop: 8, fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E5E5E5' }}>
                  <th align="left">Scope</th>
                  <th align="left">Decision</th>
                  <th align="left">Choice</th>
                  <th align="right">Effort</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((d) => {
                  const snap = Array.isArray(snapshot) ? snapshot.find((s) => s?.code === d.scopeCode) : null;
                  const decisionTitle = snap?.decisions.find((sd) => sd.id === d.decisionId)?.title ?? d.decisionId;
                  return (
                    <tr key={d.id} style={{ borderBottom: '1px solid #F1EFE8' }}>
                      <td style={{ padding: '4px 0' }}>{d.scopeCode}</td>
                      <td>{decisionTitle}</td>
                      <td>{d.choice}</td>
                      <td align="right">{d.effortDays}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </section>

        <section style={card}>
          <h2 style={cardHeading}>Recipients</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {bundle.grants.map((g) => (
              <li
                key={g.id}
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid #F1EFE8',
                  fontSize: 13,
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  alignItems: 'start',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {g.displayName ?? g.email}
                    {g.canSignOff ? (
                      <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', background: '#E1F5EE', color: '#085041', borderRadius: 4 }}>
                        Signatory
                      </span>
                    ) : null}
                  </div>
                  <div style={{ color: '#5A5A5A' }}>{g.email}</div>
                  <div style={{ color: '#888780', fontSize: 11 }}>
                    {g.acknowledgedAt ? `Acknowledged ${g.acknowledgedAt.toISOString().slice(0, 10)}` : 'Pending acknowledgement'}
                    {g.revokedAt && !g.supersededByGrantId ? ' · revoked' : ''}
                  </div>
                </div>
                <RecipientRowActions
                  grantId={g.id}
                  currentEmail={g.email}
                  bundleSigned={!!bundle.signedAt}
                  bundleRevoked={!!bundle.revokedAt}
                  canReissue={canPerformPresalesAction(user.role, 'reissue_grant')}
                  superseded={!!g.supersededByGrantId}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={cardHeading}>Recent activity</h2>
          <Link href={`/presales/${bundle.id}/audit`} style={{ fontSize: 12, color: '#002B5C' }}>
            Full audit log →
          </Link>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', fontSize: 13 }}>
          {recentEvents.slice(0, 10).map((e) => (
            <li key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid #F1EFE8', display: 'flex', justifyContent: 'space-between' }}>
              <span>{e.eventType}</span>
              <span style={{ color: '#888780' }}>{e.createdAt.toISOString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

const card: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E5E5E5',
  borderRadius: 12,
  padding: 20,
};
const cardHeading: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: '#5A5A5A',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

function btn(variant: 'primary' | 'secondary' | 'disabled'): React.CSSProperties {
  if (variant === 'primary') {
    return {
      background: '#C8102E',
      color: '#FFFFFF',
      textDecoration: 'none',
      padding: '8px 14px',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
    };
  }
  if (variant === 'disabled') {
    return {
      background: '#F5F4F0',
      color: '#888780',
      padding: '8px 14px',
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
    };
  }
  return {
    background: '#FFFFFF',
    color: '#002B5C',
    textDecoration: 'none',
    border: '1px solid #002B5C',
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
  };
}
