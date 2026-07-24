/** Middleware: Bridge NextAuth JWT sessions + API rate limiting */

import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, getClientIp, isLiveSapTenantRoute, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getCspWithNonce } from "@/lib/pwa/security-headers";

/** Per-request CSP nonce: 16 random bytes, base64. Edge-runtime safe. */
function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Attach observability headers to all responses */
function withObservabilityHeaders(
  response: NextResponse,
  requestId: string,
  requestStart: number,
): NextResponse {
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("Server-Timing", `middleware;dur=${Date.now() - requestStart}`);
  return response;
}

const SESSION_COOKIE = "abeam-session";
const BRIDGE_PATH = "/api/auth/bridge";
const NEXTAUTH_SESSION_COOKIE_PREFIXES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

function hasCookieWithPrefix(
  request: NextRequest,
  prefixes: readonly string[],
): boolean {
  const cookies = request.cookies.getAll();
  return cookies.some(({ name }) =>
    prefixes.some((prefix) => name === prefix || name.startsWith(`${prefix}.`)),
  );
}

/** Paths exempt from rate limiting — called automatically on every page load */
const RATE_LIMIT_EXEMPT = [
  "/api/auth/session",     // NextAuth fires this on every navigation
  "/api/auth/csrf",        // CSRF token fetch
  "/api/auth/providers",   // Provider list
  "/api/health",           // Monitoring / load balancer probes
  "/api/cron/",            // Cron jobs (protected by CRON_SECRET)
];

/** Hostnames that surface the Workbench / Aptus brands. When unset the
 * middleware runs with no host-routing — both surfaces are reachable on
 * whichever vercel.app hostname the request lands on. When set, the
 * middleware enforces "Workbench is /presales|/c only on WORKBENCH_HOST"
 * and "/presales|/c on PORTAL_HOST redirects to WORKBENCH_HOST".
 *
 * Cookie note: *.vercel.app is on the Public Suffix List, so cookies
 * cannot span subdomains of vercel.app. Each host has its own NextAuth
 * session. This is intentional — Workbench and the Aptus portal are
 * deliberately presented as separate products. */
const WORKBENCH_HOST = process.env.WORKBENCH_HOST ?? null;
const PORTAL_HOST = process.env.PORTAL_HOST ?? null;

/** Single-host Workbench mode. When true, this deployment IS the ABeam
 * Workbench — regardless of hostname. The root and every non-Workbench
 * page route redirect to the Workbench home (/workbench); the Aptus
 * portal (dashboard, assessments, …) is not reachable. This is the
 * single-host counterpart to the two-host WORKBENCH_HOST/PORTAL_HOST
 * split above: use WORKBENCH_ONLY when there is exactly one host and it
 * should present only the Workbench. */
const WORKBENCH_ONLY = process.env.WORKBENCH_ONLY === 'true';

/** Path prefixes that the Workbench owns on WORKBENCH_HOST. Anything
 * outside this set on WORKBENCH_HOST redirects to /presales. */
const WORKBENCH_PATHS = [
  '/workbench',         // Workbench home / hub (auth-gated under (workbench))
  '/sap-explorer',      // SAP Operations — live S/4HANA Cloud TDD explorer
  '/presales',          // consultant surface (auth-gated under (workbench))
  '/affirm',            // value-stream affirm-set workbench
  '/discovery',         // neutral (APQC) process-discovery workbench — feature-gated by NEUTRAL_DISCOVERY_ENABLED
  '/c/',                // presales guest token surface (under (external))
  '/a/',                // affirm external executive guest surface (under (external))
  '/api/auth/',         // NextAuth callbacks must work on WORKBENCH_HOST
  '/api/presales/',     // presales REST API
  '/api/affirm/',       // affirm-set REST API
  '/api/discovery/',    // neutral-discovery REST API
  '/api/health',        // probes
  '/_next/',            // build assets
  '/icons/',            // brand assets
  '/favicon',           // favicon variants
  '/manifest.json',
  '/sw.js',
] as const;

function isWorkbenchPath(pathname: string): boolean {
  if (pathname === '/presales' || pathname === '/presales/login') return true;
  if (pathname === '/affirm') return true;
  return WORKBENCH_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // Per-request CSP nonce. Placed on the REQUEST headers so Next.js auto-nonces
  // its own framework/hydration scripts on every document path, and echoed as
  // `x-nonce` so server components (root layout → next-themes) can read it. The
  // enforced CSP response header is set on whatever response the router returns.
  const nonce = generateNonce();
  const csp = getCspWithNonce(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response =
    (await handleRequest(request, requestHeaders)) ??
    NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

async function handleRequest(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<NextResponse | undefined> {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();
  const requestStart = Date.now();
  const host = request.headers.get('host')?.toLowerCase() ?? '';

  // ----- Single-host Workbench-only mode -----
  // This deployment presents ONLY the ABeam Workbench. Land the root and
  // every non-Workbench page route on the Workbench home (/workbench) and
  // keep the Aptus portal out of reach. API + assets fall through so SSR,
  // auth callbacks, and the dev-login bypass keep working.
  if (WORKBENCH_ONLY) {
    const isApiOrAsset =
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/icons/') ||
      pathname === '/manifest.json' ||
      pathname === '/sw.js' ||
      pathname === '/robots.txt' ||
      pathname.includes('.');

    // NextAuth routes sign-in/errors to "/login"; there is no Aptus login
    // on this host. Send it to the Workbench sign-in, preserving "?error=".
    if (pathname === '/login') {
      const target = new URL('/presales/login', request.url);
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target, 307);
    }

    // Allowed page surfaces: the Workbench itself, plus the /dev-login
    // internal-testing bypass (its own env gate still governs visibility).
    const isAllowedPage =
      isWorkbenchPath(pathname) ||
      pathname === '/dev-login' ||
      pathname.startsWith('/dev-login/');

    if (!isApiOrAsset && !isAllowedPage) {
      const target = new URL('/workbench', request.url);
      return NextResponse.redirect(target, 307);
    }
    // Allowed paths fall through to rate limiting + the session bridge.
  }

  // ----- Host-based product split (Workbench vs Aptus portal) -----
  // Only active when both env vars are set. Until then this block is a
  // no-op and behavior is unchanged. Auth callbacks (/api/auth/*) and
  // static assets are NEVER redirected across hosts — they must work on
  // whichever host the request lands on to keep magic-link callbacks
  // functional during the migration window when old emails point at
  // the old host and new emails point at the new host.
  if (WORKBENCH_HOST && PORTAL_HOST) {
    const isOnWorkbench = host === WORKBENCH_HOST;
    const isOnPortal = host === PORTAL_HOST;

    if (isOnWorkbench) {
      // On the Workbench host, gate anything that is not a Workbench
      // path. We redirect human-facing requests to /presales (the
      // Workbench root). API/asset paths fall through so SSR + auth
      // continue to function.
      const isApiOrAsset =
        pathname.startsWith('/api/') ||
        pathname.startsWith('/_next') ||
        pathname.startsWith('/icons/') ||
        pathname === '/manifest.json' ||
        pathname === '/sw.js' ||
        pathname === '/robots.txt' ||
        pathname.includes('.');
      // NextAuth routes sign-in failures (AccessDenied, Verification, …)
      // and the verify-request notice to pages.signIn / pages.error, both
      // of which resolve to "/login". On the Workbench host there is no
      // branded "/login", and the generic redirect below would send it to
      // "/presales" while DROPPING the "?error=" query — so a failed
      // magic-link click bounced the user back to the sign-in form with no
      // explanation (the reported "never-ending loop"). Map "/login" to the
      // Workbench sign-in page and PRESERVE the query so the page can
      // surface the actual failure reason.
      if (pathname === '/login') {
        const target = new URL('/presales/login', request.url);
        target.search = request.nextUrl.search;
        return NextResponse.redirect(target, 307);
      }
      if (!isApiOrAsset && !isWorkbenchPath(pathname)) {
        const target = new URL('/presales', request.url);
        return NextResponse.redirect(target, 307);
      }
    } else if (isOnPortal) {
      // On the Aptus portal host, send Workbench page requests to the
      // Workbench host so links + bookmarks converge on canonical URLs.
      // Auth and assets stay on whichever host the user arrives on.
      const isPageRoute =
        !pathname.startsWith('/api/') &&
        !pathname.startsWith('/_next') &&
        !pathname.startsWith('/icons/') &&
        !pathname.includes('.');
      const isWorkbenchPage =
        pathname === '/presales' ||
        pathname.startsWith('/presales/') ||
        pathname === '/affirm' ||
        pathname.startsWith('/affirm/') ||
        pathname === '/c' ||
        pathname.startsWith('/c/') ||
        pathname === '/a' ||
        pathname.startsWith('/a/');
      if (isPageRoute && isWorkbenchPage) {
        const target = new URL(request.url);
        target.host = WORKBENCH_HOST;
        target.protocol = 'https:';
        return NextResponse.redirect(target, 308);
      }
    }
  }

  // ----- API rate limiting -----
  if (pathname.startsWith("/api/")) {
    // Skip rate limiting for passive endpoints that fire automatically
    const isExempt = RATE_LIMIT_EXEMPT.some(
      (p) => pathname === p || pathname.startsWith(p),
    );

    if (!isExempt) {
      const clientIp = getClientIp(request.headers);
      const isAuthMutation = pathname.startsWith("/api/auth");
      const isReportRoute = pathname.startsWith("/api/assessments/") && pathname.includes("/report/");
      // Expensive live-SAP routes get their own tight bucket so they can't
      // amplify load onto the SAP tenant. The universal "show the data" surface
      // fans /preview + /entities out per activated service, so both must be
      // capped — not just probe=1 — before that fan-out can amplify load.
      const isSapLive = isLiveSapTenantRoute(pathname);

      // Auth mutations and report generation get tighter limits. Other
      // endpoints use method-based limits.
      const config = isSapLive
        ? RATE_LIMITS.sapLive
        : isAuthMutation
        ? RATE_LIMITS.auth
        : isReportRoute
          ? RATE_LIMITS.report
          : request.method === "GET" || request.method === "HEAD"
          ? RATE_LIMITS.apiRead
          : RATE_LIMITS.apiMutation;

      const key = isSapLive
        ? `sap-live:${clientIp}`
        : isAuthMutation
        ? `auth:${clientIp}`
        : isReportRoute
          ? `report:${clientIp}`
          : `api:${request.method}:${clientIp}`;

      const result = await checkRateLimit(key, config);

      if (!result.allowed) {
        const rateLimitResponse = new NextResponse(
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
        return withObservabilityHeaders(rateLimitResponse, requestId, requestStart);
      }

      // Non-auth API routes: return immediately with rate limit headers
      if (!isAuthMutation) {
        const response = NextResponse.next({ request: { headers: requestHeaders } });
        response.headers.set(
          "X-RateLimit-Remaining",
          String(result.remaining),
        );
        return withObservabilityHeaders(response, requestId, requestStart);
      }
    }
  }

  // ----- Session bridge for portal routes -----
  // Skip bridge for API routes, static assets, auth pages, and files with extensions
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/dev-login") ||
    pathname.startsWith("/mfa/") ||
    // Workbench (isolated presales surface) — guest URLs at /c/* must
    // never be intercepted by the NextAuth bridge, and the Workbench
    // sign-in page at /presales/login is unauthenticated by design.
    pathname.startsWith("/c/") ||
    // Affirm external guest URLs at /a/* are token/cookie-authed, never bridged.
    pathname.startsWith("/a/") ||
    pathname === "/presales/login" ||
    // …and its pre-auth children: the magic-link confirm interstitial and the
    // POST-only continue handler must never be bounced through the bridge.
    pathname.startsWith("/presales/login/") ||
    pathname.includes(".")
  ) {
    return undefined;
  }

  const hasCustomSession = request.cookies.has(SESSION_COOKIE);
  const hasNextAuthSession = hasCookieWithPrefix(
    request,
    NEXTAUTH_SESSION_COOKIE_PREFIXES,
  );

  // If user has NextAuth JWT but no custom session, bridge it
  if (hasNextAuthSession && !hasCustomSession) {
    const bridgeUrl = new URL(BRIDGE_PATH, request.url);
    bridgeUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(bridgeUrl);
  }

  // Propagate pathname to server components via REQUEST headers (so the
  // (portal) layout can build a `?next=` redirect for the MFA step-up flow).
  // Setting it on the response — as the prior code did — was a no-op because
  // server components only see the request side. We reuse the shared
  // requestHeaders (which already carry the CSP nonce) rather than rebuilding.
  requestHeaders.set("x-pathname", pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return withObservabilityHeaders(response, requestId, requestStart);
}

export const config = {
  matcher: [
    // Match all portal routes and API routes (except static assets)
    "/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json).*)",
  ],
};
