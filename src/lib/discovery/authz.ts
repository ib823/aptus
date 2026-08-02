/**
 * Ownership guard for Discovery engagements.
 *
 * `DiscoveryEngagement` is a pre-onboarding surface with no `organizationId`,
 * carrying only `createdById`. Sub-routes under `/api/discovery/sessions/[id]/*`
 * (notes, drive, grants) must scope to the consultant who created the engagement,
 * plus platform_admin. A null owner is reachable only by platform_admin.
 *
 * THE ROUTES HAD THIS AND THE PAGES DID NOT — the same split Affirm had.
 * `/discovery`, `/discovery/sessions` and `/discovery/outputs` each listed every
 * engagement from every consultant, and the three detail pages behind them —
 * one session, its facilitation console, one engagement's output pack — took an
 * id and rendered it with no check at all. Most did not even load the current
 * user. So the client label, the decisions recorded against it and the notes
 * taken in the workshop were readable by anyone with a session.
 *
 * WHAT IS DELIBERATELY NOT GUARDED. The library, coverage, health and product
 * map are practice knowledge held in a committed file — shared by construction,
 * and not one client's data. The product map is "consultant only" in the sense
 * of never reaching a CLIENT session, which the (workbench) group already
 * enforces; every consultant seeing it is the point of it existing.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isAdminRole } from "@/lib/auth/permissions";
import type { SessionUser } from "@/types/assessment";

export type DiscoveryAccess =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Returns { ok: true } when `user` may act on `engagementId`, otherwise an
 * { ok:false } carrying the 404 the caller should return (existence is not
 * disclosed across consultants).
 */
export async function requireDiscoveryEngagementAccess(
  engagementId: string,
  user: SessionUser,
): Promise<DiscoveryAccess> {
  const engagement = await prisma.discoveryEngagement.findUnique({
    where: { id: engagementId },
    select: { createdById: true },
  });

  const allowed =
    engagement != null &&
    (isAdminRole(user.role) ||
      (engagement.createdById != null && engagement.createdById === user.id));

  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not_found" }, { status: 404 }),
    };
  }
  return { ok: true };
}

/**
 * May `user` see this engagement? The same rule, for a page.
 *
 * Async where Affirm's equivalent is pure, because the Discovery detail pages
 * do not hold the engagement row — they call `getSession`, `getConsole` and
 * `buildClientPack`, which return assembled views. One indexed lookup on a
 * detail page is a fair price for not threading `createdById` through three
 * unrelated view builders.
 */
export async function discoveryEngagementReadable(
  engagementId: string,
  user: Pick<SessionUser, "id" | "role">,
): Promise<boolean> {
  if (isAdminRole(user.role)) return true;
  const engagement = await prisma.discoveryEngagement.findUnique({
    where: { id: engagementId },
    select: { createdById: true },
  });
  return engagement?.createdById != null && engagement.createdById === user.id;
}

/**
 * The same rule as a Prisma `where`, for the three lists.
 *
 * In the query rather than a filter afterwards, so `take` and any total count
 * the same set the reader can open.
 */
export function discoveryEngagementScope(
  user: Pick<SessionUser, "id" | "role">,
): { createdById?: string } {
  return isAdminRole(user.role) ? {} : { createdById: user.id };
}
