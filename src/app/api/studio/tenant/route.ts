/**
 * Switch the active tenant — server-side, via a plain link.
 *
 * WHY THIS EXISTS RATHER THAN A CLICK HANDLER. The switcher used to write
 * `document.cookie` in the browser and call `router.refresh()`. That chains three
 * fragile client behaviours: the cookie write must succeed, the click must land
 * after hydration, and the refresh must re-read the cookie rather than serve a
 * cached segment. A user reported the selection simply not changing — the tick
 * stayed on the previous tenant — and every one of those three was consistent
 * with what they saw, which is the problem: three candidate causes and no way to
 * tell them apart from outside the browser.
 *
 * The server was never at fault. Requesting the page with the cookie set by hand
 * rendered the right tenant, so the cookie contract worked and only the path to
 * setting it did not.
 *
 * A link cannot half-work. There is no hydration to wait for, no client write to
 * fail silently, and no cache to serve a stale segment: the browser navigates,
 * this route sets the cookie, and the redirect is a fresh request that reads it.
 * It also degrades correctly with JavaScript disabled, which the previous
 * version did not.
 *
 * THE KEY IS STILL VALIDATED HERE. A cookie is a view preference, not an
 * authorization input — but that is only true if nothing downstream trusts it,
 * and "nothing downstream trusts it" is a property that has to be maintained
 * rather than assumed. So this refuses a key that is not one of the caller's own
 * authorized tenants, and the layouts keep their own `pickActiveTenant` check.
 * Two independent refusals for one decision, because the cost of being wrong is
 * pointing a consultant at another organization's SAP system.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { STUDIO_TENANT_COOKIE } from "@/lib/studio/tenants";
import { resolveStudioTenants } from "@/lib/studio/tenants";

export const dynamic = "force-dynamic";

/**
 * Where to send the caller back to.
 *
 * Relative paths only, and never protocol-relative: `//evil.example` is a valid
 * URL to a browser and would make this an open redirect on a console that holds
 * SAP credentials.
 */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/studio";
  return raw;
}

export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const target = new URL(next, request.url);

  const user = await getCurrentUser();
  if (!user?.organizationId) return NextResponse.redirect(target, 303);

  // Only the caller's OWN authorized tenants. A key that is not among them is
  // ignored rather than rejected loudly: this is a navigation, and the worst
  // outcome of a stale or tampered link should be "nothing changed".
  const allowed = await resolveStudioTenants(user.organizationId);
  if (!allowed.some((t) => t.key === key)) return NextResponse.redirect(target, 303);

  const response = NextResponse.redirect(target, 303);
  response.cookies.set(STUDIO_TENANT_COOKIE, key, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    // NOT HttpOnly. The top bar reads nothing from this cookie, but keeping it
    // script-readable means a future client-side reader is possible without a
    // second cookie — and it carries no secret, only which of your own tenants
    // you were last looking at.
    httpOnly: false,
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}
