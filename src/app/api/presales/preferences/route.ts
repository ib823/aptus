/**
 * POST /api/presales/preferences — stub.
 *
 * Stores consultant preferences. v1 audits the change and returns the
 * user to the settings page; persistent storage is deferred to a follow-
 * up (no schema column yet for these defaults).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { canAccessPresales } from '@/lib/presales/rbac';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  if (!canAccessPresales(user.role)) {
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  }
  // Body intentionally not persisted in v1 — see Pass 7 deferred-items
  // note in README. The audit log line below is informational only.
  // eslint-disable-next-line no-console
  console.log(`[presales-prefs] user=${user.id} saved preferences (no-op v1)`);
  return NextResponse.redirect(new URL('/presales/settings', req.url), { status: 303 });
}
