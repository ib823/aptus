/** GET: Sign out — revokes custom session, clears all auth cookies, redirects to login */

import { NextResponse, type NextRequest } from "next/server";
import { revokeSession, SESSION_COOKIE_NAME, getSessionCookieOptions } from "@/lib/auth/session";
export async function GET(request: NextRequest): Promise<NextResponse> {
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
  const response = NextResponse.redirect(new URL(target, request.url));

  // Clear the custom session cookie
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });

  // Clear NextAuth cookies with proper security flags
  const cookieClearOptions = {
    ...getSessionCookieOptions(),
    maxAge: 0,
  };
  response.cookies.set("next-auth.session-token", "", cookieClearOptions);
  response.cookies.set("next-auth.csrf-token", "", cookieClearOptions);
  response.cookies.set("next-auth.callback-url", "", cookieClearOptions);

  return response;
}
