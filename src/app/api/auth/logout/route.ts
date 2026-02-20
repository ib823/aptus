/** GET: Sign out — revokes custom session, clears all auth cookies, redirects to login */

import { NextResponse, type NextRequest } from "next/server";
import { revokeSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

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

  const response = NextResponse.redirect(new URL("/login", request.url));

  // Clear the custom session cookie
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  // Clear NextAuth cookies
  response.cookies.set("next-auth.session-token", "", {
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("next-auth.csrf-token", "", {
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("next-auth.callback-url", "", {
    path: "/",
    maxAge: 0,
  });

  return response;
}
