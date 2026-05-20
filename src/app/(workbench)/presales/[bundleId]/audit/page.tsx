/**
 * Bundle audit log — /presales/[bundleId]/audit.
 *
 * Full event timeline with filter (event type), search (free text on
 * payload), and CSV export. Read-only.
 */

import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { canAccessPresales } from '@/lib/presales/rbac';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ bundleId: string }>;
  searchParams: Promise<{ event?: string; q?: string }>;
}

export const metadata = { title: { absolute: 'Audit log — Workbench' } };

export default async function PresalesAuditPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canAccessPresales(user.role)) redirect('/dashboard');

  const { bundleId } = await params;
  const sp = await searchParams;
  const filterEvent = sp.event ?? '';
  const query = (sp.q ?? '').toLowerCase();

  const bundle = await prisma.presalesBundle.findFirst({
    where: { id: bundleId, ...(user.organizationId ? { organizationId: user.organizationId } : {}) },
    select: { id: true, clientCompanyName: true },
  });
  if (!bundle) notFound();

  const events = await prisma.presalesAuditEvent.findMany({
    where: {
      bundleId,
      ...(filterEvent ? { eventType: filterEvent } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const filtered = query
    ? events.filter((e) => JSON.stringify(e.payload).toLowerCase().includes(query))
    : events;

  // CSV export is at /api/presales/bundles/[bundleId]/audit.csv — Next
  // page components can only return ReactNode, not a Response, so the
  // download lives on the API surface and the page just links to it.

  // Unique event types from result set, for filter dropdown.
  const eventTypes = Array.from(new Set(events.map((e) => e.eventType))).sort();

  return (
    <main style={{ maxWidth: 1280, margin: '32px auto', padding: '0 24px' }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: '#5A5A5A', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Workbench · Audit · {bundle.clientCompanyName}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: '4px 0 0', color: '#002B5C' }}>
          Bundle audit log
        </h1>
      </header>

      <form method="GET" style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select name="event" defaultValue={filterEvent} style={{ padding: '6px 10px', border: '1px solid #E5E5E5', borderRadius: 8, fontSize: 13 }}>
          <option value="">All events</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="search"
          name="q"
          placeholder="Search payload"
          defaultValue={sp.q ?? ''}
          style={{ flex: '1 1 280px', padding: '6px 10px', border: '1px solid #E5E5E5', borderRadius: 8, fontSize: 13 }}
        />
        <button type="submit" style={{ padding: '6px 14px', border: '1px solid #002B5C', borderRadius: 8, background: '#FFFFFF', color: '#002B5C', fontSize: 13, fontWeight: 600 }}>
          Apply
        </button>
        <a
          href={`/api/presales/bundles/${encodeURIComponent(bundleId)}/audit.csv?event=${encodeURIComponent(filterEvent)}&q=${encodeURIComponent(sp.q ?? '')}`}
          style={{ padding: '6px 14px', border: '1px solid #E5E5E5', borderRadius: 8, background: '#F5F4F0', color: '#1A1A1A', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
        >
          Export CSV
        </a>
      </form>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #E5E5E5', background: '#F1EFE8' }}>
            <th style={{ textAlign: 'left', padding: 8 }}>When</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Event</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Grant</th>
            <th style={{ textAlign: 'left', padding: 8 }}>IP</th>
            <th style={{ textAlign: 'left', padding: 8 }}>Payload</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <tr key={e.id} style={{ borderBottom: '1px solid #F1EFE8', verticalAlign: 'top' }}>
              <td style={{ padding: 8, fontFamily: 'Consolas, monospace' }}>{e.createdAt.toISOString()}</td>
              <td style={{ padding: 8 }}>{e.eventType}</td>
              <td style={{ padding: 8, fontFamily: 'Consolas, monospace' }}>{e.grantId ?? '—'}</td>
              <td style={{ padding: 8, fontFamily: 'Consolas, monospace' }}>{e.ip ?? '—'}</td>
              <td style={{ padding: 8, fontFamily: 'Consolas, monospace', whiteSpace: 'pre-wrap', maxWidth: 480, overflow: 'hidden' }}>
                {JSON.stringify(e.payload)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
