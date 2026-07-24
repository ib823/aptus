/**
 * Ownership guards for the Affirm module.
 *
 * `AffirmBundle` has no `organizationId` (it predates the org model and carries
 * only `createdById`). Every `/api/affirm/bundles/[id]/*` route must therefore
 * scope access to the consultant who created the bundle, plus platform_admin.
 * A bundle whose `createdById` is null is reachable only by platform_admin.
 *
 * Use `requireAffirmBundleAccess` at the top of each route to fail closed with a
 * uniform envelope before any read or mutation touches another consultant's set.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isAdminRole } from "@/lib/auth/permissions";
import type { SessionUser } from "@/types/assessment";

export type AffirmBundleAccess =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * Returns { ok: true } when `user` may act on `bundleId`, otherwise an { ok:false }
 * carrying the exact NextResponse the caller should return (404 when the bundle
 * does not exist OR the caller is not allowed to see it — we do not distinguish
 * the two, to avoid leaking bundle existence across tenants).
 */
export async function requireAffirmBundleAccess(
  bundleId: string,
  user: SessionUser,
): Promise<AffirmBundleAccess> {
  const bundle = await prisma.affirmBundle.findUnique({
    where: { id: bundleId },
    select: { createdById: true },
  });

  const allowed =
    bundle != null &&
    (isAdminRole(user.role) ||
      (bundle.createdById != null && bundle.createdById === user.id));

  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: "not_found" }, { status: 404 }),
    };
  }
  return { ok: true };
}
