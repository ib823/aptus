/**
 * GET /api/presales/bundles/[bundleId]/audit.csv
 *
 * CSV export of the audit log. Same RBAC + filter semantics as the
 * /presales/[bundleId]/audit page; lives separately because Next page
 * components can only return ReactNode, not a Response.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { canAccessPresales } from '@/lib/presales/rbac';

interface RouteCtx {
  params: Promise<{ bundleId: string }>;
}

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  if (!canAccessPresales(user.role)) {
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  const { bundleId } = await ctx.params;
  const url = new URL(req.url);
  const filterEvent = url.searchParams.get('event') ?? '';
  const query = (url.searchParams.get('q') ?? '').toLowerCase();

  const bundle = await prisma.presalesBundle.findFirst({
    where: { id: bundleId, ...(user.organizationId ? { organizationId: user.organizationId } : {}) },
    select: { id: true },
  });
  if (!bundle) return NextResponse.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });

  const events = await prisma.presalesAuditEvent.findMany({
    where: {
      bundleId,
      ...(filterEvent ? { eventType: filterEvent } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  const filtered = query
    ? events.filter((e) => JSON.stringify(e.payload).toLowerCase().includes(query))
    : events;

  const header = 'createdAt,eventType,grantId,actorUserId,ip,userAgent,payload\n';
  const rows = filtered
    .map((e) =>
      [
        e.createdAt.toISOString(),
        e.eventType,
        e.grantId ?? '',
        e.actorUserId ?? '',
        e.ip ?? '',
        (e.userAgent ?? '').replace(/,/g, ' '),
        JSON.stringify(e.payload).replace(/"/g, '""'),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');

  return new Response(header + rows, {
    headers: {
      'content-type': 'text/csv',
      'content-disposition': `attachment; filename="presales-audit-${bundleId}.csv"`,
    },
  });
}
