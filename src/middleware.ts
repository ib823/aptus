/** Middleware: Bridge NextAuth JWT sessions + API rate limiting */

import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/security/rate-limit";

const SESSION_COOKIE = "abeam-session";
const NEXTAUTH_COOKIE = "next-auth.session-token";
const BRIDGE_PATH = "/api/auth/bridge";

/** Paths exempt from rate limiting — called automatically on every page load */
const RATE_LIMIT_EXEMPT = [
  "/api/auth/session",     // NextAuth fires this on every navigation
  "/api/auth/csrf",        // CSRF token fetch
  "/api/auth/providers",   // Provider list
  "/api/health",           // Monitoring / load balancer probes
  "/api/cron/",            // Cron jobs (protected by CRON_SECRET)
];

export function middleware(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;

  // ----- API rate limiting -----
  if (pathname.startsWith("/api/")) {
    // Skip rate limiting for passive endpoints that fire automatically
    const isExempt = RATE_LIMIT_EXEMPT.some(
      (p) => pathname === p || pathname.startsWith(p),
    );

    if (!isExempt) {
      const clientIp = getClientIp(request.headers);
      const isAuthMutation = pathname.startsWith("/api/auth");

      // Auth mutations (signin, callback, signout) get tighter limits
      // Other endpoints use method-based limits
      const config = isAuthMutation
        ? RATE_LIMITS.auth
        : request.method === "GET" || request.method === "HEAD"
          ? RATE_LIMITS.apiRead
          : RATE_LIMITS.apiMutation;

      const key = isAuthMutation
        ? `auth:${clientIp}`
        : `api:${request.method}:${clientIp}`;

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

      // Non-auth API routes: return immediately with rate limit headers
      if (!isAuthMutation) {
        const response = NextResponse.next();
        response.headers.set(
          "X-RateLimit-Remaining",
          String(result.remaining),
        );
        return response;
      }
    }
  }

  // ----- Session bridge for portal routes -----
  // Skip bridge for API routes, static assets, auth pages, and files with extensions
  if (
    pathname.startsWith("/api/") ||
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

  // Set pathname header for server components (used by OnboardingGuard)
  const response = NextResponse.next();
  response.headers.set("x-pathname", pathname);
  return response;
}

export const config = {
  matcher: [
    // Match all portal routes and API routes (except static assets)
    "/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json).*)",
  ],
};
