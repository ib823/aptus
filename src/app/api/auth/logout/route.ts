/**
 * POST: Sign out — revokes custom session, clears all auth cookies, redirects
 * to login.
 *
 * POST-ONLY BECAUSE A GET THAT MUTATES IS CSRF-ABLE. As a GET, any page on the
 * internet could sign a user out with an <img src> — a nuisance attack, but
 * also a primitive for session-fixation setups. The session cookie is SameSite,
 * so a cross-site POST does not carry it and cannot revoke anything. The GET
 * handler remains as a compat redirect for old bookmarks and mutates nothing.
 */

import { NextResponse, type NextRequest } from "next/server";
import { revokeSession, SESSION_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth/session";

/** Compat for old bookmarks/links: redirect to the sign-in page, mutate nothing. */
export function GET(request: NextRequest): NextResponse {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const isWorkbench = !!process.env.WORKBENCH_HOST && host === process.env.WORKBENCH_HOST;
  return NextResponse.redirect(new URL(isWorkbench ? "/presales/login" : "/login", request.url));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Revoke the custom session in the database
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    try {
      await revokeSession(token, "user_logout");
    } catch {
      // Session may already be revoked or expired — continue
    }
  }

  // Host-aware post-logout redirect: workbench users land on the
  // workbench sign-in (/presales/login); portal users on /login.
  // The middleware would eventually bounce a wrong-host redirect to
  // the right place, but routing here avoids an extra hop and a flash
  // of the wrong page.
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const isWorkbench =
    !!process.env.WORKBENCH_HOST && host === process.env.WORKBENCH_HOST;
  const target = isWorkbench ? "/presales/login" : "/login";
  // 303: the redirect after a POST must become a GET — a 307 would re-POST
  // the login page and 405.
  const response = NextResponse.redirect(new URL(target, request.url), 303);

  // Clear the custom session cookie
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });

  // Clear NextAuth cookies with proper security flags.
  //
  // In production NextAuth issues cookies under the secure-prefixed names
  // (`__Secure-next-auth.session-token`, `__Host-next-auth.csrf-token`, …), NOT
  // the bare `next-auth.*` names. If we only clear the bare names, the JWT
  // survives logout and the middleware's `hasNextAuthSession && !hasCustomSession`
  // branch silently re-mints a fresh custom session via /api/auth/bridge — the
  // user is logged straight back in for up to the JWT maxAge. So we must expire
  // every NextAuth cookie variant, including the prefixed and chunked (`.0`/`.1`)
  // forms. Enumerate whatever the browser actually sent and clear anything that
  // looks like a NextAuth cookie.
  const cookieClearOptions = {
    ...getSessionCookieOptions(),
    maxAge: 0,
  };
  const NEXTAUTH_COOKIE_RE =
    /^(?:__Secure-|__Host-)?next-auth\.[a-z-]+(?:\.\d+)?$/;
  const present = request.cookies.getAll();
  const namesToClear = new Set<string>([
    // Always attempt the canonical names even if not sent this request.
    "next-auth.session-token",
    "next-auth.csrf-token",
    "next-auth.callback-url",
    "__Secure-next-auth.session-token",
    "__Secure-next-auth.callback-url",
    "__Host-next-auth.csrf-token",
  ]);
  for (const c of present) {
    if (NEXTAUTH_COOKIE_RE.test(c.name)) namesToClear.add(c.name);
  }
  for (const name of namesToClear) {
    response.cookies.set(name, "", cookieClearOptions);
  }

  return response;
}
