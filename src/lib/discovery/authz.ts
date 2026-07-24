/**
 * Ownership guard for Discovery engagements.
 *
 * `DiscoveryEngagement` is a pre-onboarding surface with no `organizationId`,
 * carrying only `createdById`. Sub-routes under `/api/discovery/sessions/[id]/*`
 * (notes, drive, grants) must scope to the consultant who created the engagement,
 * plus platform_admin. A null owner is reachable only by platform_admin.
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
