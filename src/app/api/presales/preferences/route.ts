/**
 * POST /api/presales/preferences — persist consultant settings.
 *
 * THIS WAS A NO-OP THAT ANSWERED WITH SUCCESS. The settings form POSTed here
 * since Pass 7; the route logged a line in dev and 303-redirected back, so
 * pressing Save looked like it worked while storing nothing. The column now
 * exists (User.presalesPreferences) and the form reads its values back — the
 * redirect is the same, but it is no longer a lie.
 *
 * Parsing is tolerant (clamp, fall back, ignore unknown fields) because this
 * is a browser form, not an API client — see lib/presales/preferences.ts.
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { canAccessPresales } from '@/lib/presales/rbac';
import { parsePresalesPreferences } from '@/lib/presales/preferences';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  if (!canAccessPresales(user.role)) {
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  const prefs = parsePresalesPreferences(await req.formData());
  await prisma.user.update({
    where: { id: user.id },
    data: { presalesPreferences: prefs as unknown as Prisma.InputJsonValue },
  });

  // 303 = POST-redirect-GET back to the form, which now renders what was saved.
  return NextResponse.redirect(new URL('/presales/settings', req.url), { status: 303 });
}
