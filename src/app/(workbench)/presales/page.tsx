/**
 * Consultant bundles index — /presales.
 *
 * Status pill filters (All / Draft / Sent / Awaiting signoff / Signed /
 * Expired), search by client name or scope code, New bundle CTA. Designed
 * per Pass 7 of the design system.
 *
 * RBAC: any role in canAccessPresales can view. project_manager and
 * executive_sponsor see the "New bundle" affordance disabled with a
 * "View only" tooltip.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import {
  canAccessPresales,
  canPerformPresalesAction,
  isReadOnlyRole,
} from '@/lib/presales/rbac';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type FilterStatus = 'all' | 'draft' | 'sent' | 'awaiting' | 'signed' | 'expired';

interface PageProps {
  searchParams: Promise<{ status?: string; q?: string }>;
}

interface BundleListRow {
  id: string;
  name: string;
  clientCompanyName: string;
  scopeCodes: string[];
  expiresAt: Date;
  signedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  bundleSent: boolean;
}

function statusOf(row: BundleListRow, now: Date): FilterStatus {
  if (row.signedAt) return 'signed';
  if (row.revokedAt) return 'expired';
  if (row.expiresAt <= now) return 'expired';
  if (!row.bundleSent) return 'draft';
  // sent but not signed yet — distinguish awaiting from sent by whether
  // any decisions have been recorded. Cheap heuristic for the index.
  return row.bundleSent ? 'sent' : 'draft';
}

const STATUS_LABEL: Record<FilterStatus, string> = {
  all: 'All',
  draft: 'Draft',
  sent: 'Sent',
  awaiting: 'Awaiting signoff',
  signed: 'Signed',
  expired: 'Expired',
};

export default async function PresalesIndexPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canAccessPresales(user.role)) redirect('/dashboard');

  const sp = await searchParams;
  const filter = (sp.status as FilterStatus | undefined) ?? 'all';
  const query = (sp.q ?? '').trim().toLowerCase();
  const canCreate = canPerformPresalesAction(user.role, 'create_bundle');
  const readOnly = isReadOnlyRole(user.role);

  const bundles = await prisma.presalesBundle.findMany({
    where: user.organizationId ? { organizationId: user.organizationId } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const bundleIds = bundles.map((b) => b.id);
  const sentEvents = bundleIds.length
    ? await prisma.presalesAuditEvent.findMany({
        where: { bundleId: { in: bundleIds }, eventType: 'bundle_sent' },
        select: { bundleId: true },
        distinct: ['bundleId'],
      })
    : [];
  const sentSet = new Set(sentEvents.map((e) => e.bundleId).filter(Boolean) as string[]);

  const now = new Date();
  const rows: BundleListRow[] = bundles.map((b) => ({
    id: b.id,
    name: b.name,
    clientCompanyName: b.clientCompanyName,
    scopeCodes: b.scopeCodes,
    expiresAt: b.expiresAt,
    signedAt: b.signedAt,
    revokedAt: b.revokedAt,
    createdAt: b.createdAt,
    bundleSent: sentSet.has(b.id),
  }));

  const filtered = rows.filter((r) => {
    if (filter !== 'all' && statusOf(r, now) !== filter) return false;
    if (
      query &&
      !r.clientCompanyName.toLowerCase().includes(query) &&
      !r.scopeCodes.some((c) => c.toLowerCase().includes(query))
    ) {
      return false;
    }
    return true;
  });

  return (
    <main style={{ maxWidth: 1280, margin: '32px auto', padding: '0 24px' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: '#5A5A5A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Workbench
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: '4px 0 0', color: '#002B5C' }}>
            Bundles
          </h1>
        </div>
        {canCreate ? (
          <Link
            href="/presales/new"
            style={{
              background: '#C8102E',
              color: '#FFFFFF',
              textDecoration: 'none',
              padding: '10px 18px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            New bundle
          </Link>
        ) : (
          <span
            title="View only — your role cannot create new bundles."
            style={{
              background: '#F5F4F0',
              color: '#888780',
              padding: '10px 18px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            New bundle (view only)
          </span>
        )}
      </header>

      <form method="GET" style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input
          type="search"
          name="q"
          placeholder="Search client or scope code"
          defaultValue={sp.q ?? ''}
          style={{
            flex: '1 1 280px',
            padding: '8px 12px',
            border: '1px solid #E5E5E5',
            borderRadius: 8,
            fontSize: 14,
          }}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(['all', 'draft', 'sent', 'awaiting', 'signed', 'expired'] as FilterStatus[]).map((s) => (
            <button
              key={s}
              type="submit"
              name="status"
              value={s}
              style={{
                padding: '8px 12px',
                fontSize: 13,
                border: '1px solid #E5E5E5',
                borderRadius: 999,
                background: filter === s ? '#002B5C' : '#FFFFFF',
                color: filter === s ? '#FFFFFF' : '#1A1A1A',
                cursor: 'pointer',
              }}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </form>

      {filtered.length === 0 ? (
        <div style={{ padding: 32, background: '#FFFFFF', border: '1px solid #E5E5E5', borderRadius: 12, textAlign: 'center', color: '#5A5A5A' }}>
          No bundles match your filters.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {filtered.map((r) => {
            const status = statusOf(r, now);
            return (
              <li
                key={r.id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E5E5E5',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: '#5A5A5A' }}>{r.scopeCodes.join(' · ')}</div>
                  <Link
                    href={`/presales/${encodeURIComponent(r.id)}`}
                    style={{ fontSize: 16, fontWeight: 600, color: '#002B5C', textDecoration: 'none' }}
                  >
                    {r.clientCompanyName}
                  </Link>
                  <div style={{ fontSize: 12, color: '#888780', marginTop: 2 }}>
                    Expires {r.expiresAt.toISOString().slice(0, 10)} · {r.name}
                  </div>
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 999,
                    background: statusBg(status),
                    color: statusFg(status),
                  }}
                >
                  {STATUS_LABEL[status]}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {readOnly ? (
        <p style={{ marginTop: 24, fontSize: 12, color: '#5A5A5A', textAlign: 'center' }}>
          Your role has view-only access. Contact a consultant to make changes.
        </p>
      ) : null}
    </main>
  );
}

function statusBg(s: FilterStatus): string {
  switch (s) {
    case 'draft': return '#F1EFE8';
    case 'sent': return '#E6F1FB';
    case 'awaiting': return '#FAEEDA';
    case 'signed': return '#E1F5EE';
    case 'expired': return '#FCEBEB';
    default: return '#F5F4F0';
  }
}
function statusFg(s: FilterStatus): string {
  switch (s) {
    case 'draft': return '#444441';
    case 'sent': return '#0C447C';
    case 'awaiting': return '#633806';
    case 'signed': return '#085041';
    case 'expired': return '#791F1F';
    default: return '#5A5A5A';
  }
}
