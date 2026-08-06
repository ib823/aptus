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

import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { canAccessStudio } from "@/lib/studio/rbac";
import { ERROR_CODES } from "@/types/api";

/**
 * Returns null when the caller may probe, or the refusal to return when not.
 *
 * PUBLIC ACCESS DOES NOT APPLY HERE, AND THE FIRST VERSION OF THIS GUARD SAID
 * IT DID. It opened with `if (isSapTddPublicAccessEnabled(prefix)) return null`
 * under a comment claiming that flag "is off in production unless explicitly
 * enabled". It is explicitly enabled on this deployment — so the early return
 * fired on every request and the entire role check below was unreachable. The
 * fix shipped, passed CI, and changed nothing.
 *
 * It was caught by an unauthenticated curl: no session at all, HTTP 200, a real
 * 325ms round trip to the tenant. So the exposure was never "every
 * authenticated role" — it was everyone, and the guard's own header was the
 * reason nobody looked at the line beneath it.
 *
 * The rule now has no exception, because the flag answers a different question.
 * `PUBLIC_ACCESS` means "this catalogue may be browsed without an account".
 * Opening a connection to a configured SAP tenant and issuing an OData request
 * is not browsing: it consumes that tenant's quota, appears in its logs, and is
 * made in CoreEdge's name. A read nobody is accountable for is the one case
 * this guard exists to prevent, so an anonymous caller is the LAST caller who
 * should reach it.
 *
 * If a public demo genuinely needs anonymous live reads, that is a real
 * requirement and it needs its own narrow affordance — a designated demo tenant
 * with its own quota — not the removal of this check for every tenant at once.
 */
export async function refuseUnlessMayProbeTenant(): Promise<NextResponse | null> {
  // The old `_envPrefix` parameter was accepted and ignored — an argument that
  // LOOKS like it scopes the guard per tenant but does nothing is worse than
  // none, because a reader trusts the scoping it implies. The guard is
  // deliberately tenant-agnostic: who may probe is a property of the caller.
  // EVERY REFUSAL CARRIES A CORRELATION ID. This guard originally returned
  // {code, message} only, while the auth layer's 401s and Control Tower's 403s
  // both carried one — so the single path most likely to be debugged under
  // pressure, a live SAP read, was the one with nothing to quote. The status
  // code was reviewed and shipped; the envelope contract was not.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: "Not authenticated",
          correlationId: randomUUID(),
        },
      },
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
          correlationId: randomUUID(),
        },
      },
      { status: 403 },
    );
  }

  return null;
}
