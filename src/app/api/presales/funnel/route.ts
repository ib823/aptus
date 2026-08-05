/**
 * GET /api/presales/funnel — cross-bundle conversion funnel for the
 * consultant's organization.
 *
 * Query params:
 *   days — lookback window, 1..365, default 90.
 *
 * platform_admin with no organization sees all tenants; every other caller is
 * scoped to their own organization, and callers with no tenant to scope to are
 * rejected (lacksTenantScope) rather than silently widened.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { canAccessPresales, lacksTenantScope } from '@/lib/presales/rbac';
import { computePresalesFunnel } from '@/lib/presales/funnel';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Sign in required.' } },
      { status: 401 },
    );
  }
  if (!canAccessPresales(user.role)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Your role cannot view the presales funnel.' } },
      { status: 403 },
    );
  }
  if (lacksTenantScope(user)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'No organization to scope this view to.' } },
      { status: 403 },
    );
  }

  const daysRaw = Number(req.nextUrl.searchParams.get('days') ?? '90');
  const days = Number.isFinite(daysRaw) ? Math.min(365, Math.max(1, Math.trunc(daysRaw))) : 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const funnel = await computePresalesFunnel(user.organizationId, since);

  return NextResponse.json({ data: funnel });
}
