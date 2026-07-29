/**
 * Who may cause CoreEdge to read a customer's SAP tenant.
 *
 * `/api/sap/tdd/entities` and `/api/sap/tdd/preview` are not catalogue lookups.
 * Each one opens a live connection to a client's S/4HANA Cloud system and issues
 * a real OData request against it — measured round trips, logged at the far end,
 * counted against that tenant's limits. They were gated on "is anyone signed in"
 * and nothing else, so every authenticated role could fire them: an executive
 * sponsor, a project manager, a partner lead, support.
 *
 * That was not a deliberate looseness, it was a gap. The sibling routes under
 * hub-content — probe-all and write-test — are behind `requireAdmin` on exactly
 * the reasoning that a probe generates real outbound traffic. The same reasoning
 * applies here and the guard was simply never applied. Found by calling the
 * endpoint as all six roles and getting six 200s.
 *
 * THE GATE IS `canAccessStudio` — consultant and platform_admin — rather than
 * admin-only. Reading a tenant to see what it exposes IS the builder's job; it
 * is how an interface gets defined at all, and locking it to admins would break
 * the product's main workflow to close a hole the builder is not the source of.
 * The four roles that lose access never had a reason to probe: they read
 * governance, not tenants.
 *
 * ONE GUARD, TWO ROUTES, ON PURPOSE. The neighbouring pair drifted — probe-all
 * answers 403 FORBIDDEN and write-test answers 401 UNAUTHORIZED to the same
 * authenticated non-admin caller, because each hand-rolled its own refusal. Two
 * copies of a rule is two rules. This returns one response for one decision.
 *
 * 401 vs 403 IS NOT COSMETIC. 401 means "I do not know who you are, try
 * authenticating"; a client that receives it on an authenticated call will
 * re-authenticate forever. 403 means "I know exactly who you are and the answer
 * is no". This returns 401 only when there genuinely is no session.
 */

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { canAccessStudio } from "@/lib/studio/rbac";
import { ERROR_CODES } from "@/types/api";

import { isSapTddPublicAccessEnabled } from "./tdd-connector";

/**
 * Returns null when the caller may probe, or the refusal to return when not.
 *
 * The public-access branch is unchanged and deliberate: it is off in production
 * unless explicitly enabled, and exists so the public TDD catalogue can be
 * demonstrated without an account.
 */
export async function refuseUnlessMayProbeTenant(
  envPrefix: string,
): Promise<NextResponse | null> {
  if (isSapTddPublicAccessEnabled(envPrefix)) return null;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: ERROR_CODES.UNAUTHORIZED, message: "Not authenticated" } },
      { status: 401 },
    );
  }

  if (!canAccessStudio(user.role)) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.FORBIDDEN,
          message:
            "Reading a connected SAP tenant is limited to Developer Studio roles. " +
            "Your role can view what was found, but not cause a new read.",
        },
      },
      { status: 403 },
    );
  }

  return null;
}
