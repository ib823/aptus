/** Proxy: Bridge NextAuth JWT sessions to custom session cookies */

import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "fit-portal-session";
const NEXTAUTH_COOKIE = "next-auth.session-token";
const BRIDGE_PATH = "/api/auth/bridge";

export function proxy(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;

  // Skip for static assets, API routes, and auth pages
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/mfa/") ||
    pathname.includes(".")
  ) {
    return undefined;
  }

  const hasCustomSession = request.cookies.has(SESSION_COOKIE);
  const hasNextAuthSession = request.cookies.has(NEXTAUTH_COOKIE);

  // If user has NextAuth JWT but no custom session, bridge it
  if (hasNextAuthSession && !hasCustomSession) {
    const bridgeUrl = new URL(BRIDGE_PATH, request.url);
    bridgeUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(bridgeUrl);
  }

  return undefined;
}

export const config = {
  matcher: [
    // Match all portal routes
    "/((?!_next/static|_next/image|favicon.ico|api|login|mfa).*)",
  ],
};
