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
 *
 * THE ROUTES HAD THIS. THE PAGES DID NOT.
 *
 * Every `/affirm/[id]/*` page checked for a session and then read the bundle by
 * id with no authorization at all — so the API refused to let one consultant
 * mutate another's bundle while the screen beside it rendered that same bundle
 * in full: the client's name, every question, every answer with the client's
 * stated reason for deviating, and the signed record. A guard on the mutation
 * path only is not a guard; it is a lock on a door beside an open window.
 *
 * `affirmBundleReadableBy` is the same rule as a pure predicate, so the pages
 * can apply it to the bundle they have ALREADY fetched rather than paying for a
 * second query. `findUnique` without a `select` returns every scalar, so
 * `createdById` is on the object already.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { isAdminRole } from "@/lib/auth/permissions";
import type { SessionUser } from "@/types/assessment";

export type AffirmBundleAccess =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * May `user` see this bundle at all?
 *
 * The single rule both the routes and the pages enforce: the consultant who
 * created it, or a platform admin. A bundle with no creator is admin-only,
 * because there is nobody else it could belong to.
 *
 * Pure and synchronous on purpose — a predicate that needs a database round
 * trip is one a page can be tempted to skip.
 */
export function affirmBundleReadableBy(
  bundle: { createdById: string | null },
  user: Pick<SessionUser, "id" | "role">,
): boolean {
  if (isAdminRole(user.role)) return true;
  return bundle.createdById != null && bundle.createdById === user.id;
}

/**
 * The same rule as a Prisma `where`, for listing.
 *
 * A list cannot use the predicate above without fetching everything first and
 * filtering in memory — which would still read every bundle out of the database
 * and would make `take` and the totals count rows the caller may not see. This
 * is the one place the scope is widened, which is what makes it reviewable.
 */
export function affirmBundleScope(
  user: Pick<SessionUser, "id" | "role">,
): { createdById?: string } {
  return isAdminRole(user.role) ? {} : { createdById: user.id };
}

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
