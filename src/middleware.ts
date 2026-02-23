/** Middleware: Bridge NextAuth JWT sessions + API rate limiting */

import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/security/rate-limit";

const SESSION_COOKIE = "aptus-session";
const NEXTAUTH_COOKIE = "next-auth.session-token";
const BRIDGE_PATH = "/api/auth/bridge";

export function middleware(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;

  // ----- API rate limiting -----
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth")) {
    const clientIp = getClientIp(request.headers);
    const method = request.method;

    // Pick rate limit config based on method
    const config =
      method === "GET" || method === "HEAD"
        ? RATE_LIMITS.apiRead
        : RATE_LIMITS.apiMutation;

    // Auth endpoints get tighter limits
    const key = pathname.startsWith("/api/auth")
      ? `auth:${clientIp}`
      : `api:${method}:${clientIp}`;

    const result = checkRateLimit(key, config);

    if (!result.allowed) {
      return new NextResponse(
        JSON.stringify({
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests. Please try again later.",
          },
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(result.resetMs / 1000)),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }

    // For API routes, add rate limit headers but don't proceed with session bridge
    const response = NextResponse.next();
    response.headers.set(
      "X-RateLimit-Remaining",
      String(result.remaining),
    );
    return response;
  }

  // ----- Session bridge for portal routes -----
  if (
    pathname.startsWith("/_next") ||
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
    // Match all portal routes and API routes (except static assets)
    "/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json).*)",
  ],
};
