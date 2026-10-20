/** Middleware: Bridge NextAuth JWT sessions + API rate limiting */

import { NextResponse, type NextRequest } from "next/server";
import { machineAuthFailureKey } from "@/lib/northbound/auth-failures";
import { extractBearer } from "@/lib/northbound/bearer";
import {
  checkRateLimit,
  getClientIp,
  isLiveSapTenantRoute,
  isMachineApiRoute,
  machineCredentialKey,
  machineRateLimitMode,
  peekRateLimit,
  RATE_LIMITS,
  type RateLimitResult,
} from "@/lib/security/rate-limit";
import {
  isLimiterOutage,
  limiterUnavailableResponse,
  LIMITER_UNAVAILABLE_MESSAGE,
  retryAfterSeconds,
} from "@/lib/security/rate-limit-response";
import { getCspWithNonce } from "@/lib/pwa/security-headers";
// The Workbench route allow-list lives in lib so it can be tested. Anything
// missing from it is redirected away before auth or RBAC ever run.
import { isWorkbenchOnlyPage, isWorkbenchPath } from "@/lib/routing/workbench-paths";

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
  "/api/build",            // Build stamp — the deploy check, called during incidents
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

/**
 * The edge limit for an authenticated MACHINE route (audit A43, P0.5), or null
 * when the request takes the ordinary per-IP API buckets instead.
 *
 * WHY NOT THE IP. Every /api/* call used to spend `api:<method>:<ip>`, so one
 * credential looping from a vendor's server spent the whole address's
 * allowance, and every other customer's credential behind that egress was
 * refused here — before its own route, with no correlation id and no audit
 * row — though its own budget was untouched. A machine call carrying a bearer
 * is now counted against THAT credential (a hash of it; the route still
 * authenticates it), and then against a high per-address backstop that only a
 * flood of random keys can reach.
 *
 * THE ORDER IS THE ISOLATION. The backstop is checked only once the
 * credential's own bucket admitted the call, so a runaway key — refused at its
 * own ceiling — spends at most that ceiling of its address's backstop.
 *
 * A machine call with NO bearer is not a credential at all; it keeps the
 * per-IP bucket it always had (and the route answers it 401).
 *
 * MADE-UP KEYS ARE BOUNDED BY THE ADDRESS, FIRST. A new junk bearer on every
 * call is a new credential bucket every time, so neither bucket above holds a
 * client that cannot authenticate: each call it sent cost the route a database
 * lookup, 6,000 a minute per address where the per-IP bucket allowed 120. The
 * route counts every failed lookup in `machine-authfail:<ip>`
 * (northbound/auth-failures.ts); it is read here, without spending it, before
 * anything else, and once it is empty the address is refused until the window
 * frees room. A key whose lookups succeed never spends it. Read as unknown
 * (the limiter cannot be asked), it refuses nothing: the buckets below then
 * answer the outage.
 */
async function machineRouteLimit(
  request: NextRequest,
  pathname: string,
  clientIp: string,
): Promise<{ result: RateLimitResult; by: MachineRefusalBy } | null> {
  if (!isMachineApiRoute(pathname) || machineRateLimitMode() !== "credential") return null;
  const bearer = extractBearer(request.headers.get("authorization"));
  if (!bearer) return null;
  const failures = await peekRateLimit(machineAuthFailureKey(clientIp), RATE_LIMITS.machineAuthFailure);
  if (failures && failures.remaining <= 0) {
    // The peek has no reset time; a full window is the longest it can be.
    const resetMs = RATE_LIMITS.machineAuthFailure.windowMs;
    return { result: { allowed: false, remaining: 0, resetMs, reason: "limited" }, by: "failed-credentials" };
  }
  const own = await checkRateLimit(await machineCredentialKey(bearer), RATE_LIMITS.machineCredential);
  if (!own.allowed) return { result: own, by: "credential" };
  const backstop = await checkRateLimit(`machine-ip:${clientIp}`, RATE_LIMITS.machineIpBackstop);
  if (!backstop.allowed) return { result: backstop, by: "address" };
  return { result: { ...own, remaining: Math.min(own.remaining, backstop.remaining) }, by: "credential" };
}

/** Whose limit refused a machine call at the edge. */
type MachineRefusalBy = "credential" | "address" | "failed-credentials";

const MACHINE_REFUSAL_MESSAGES: Record<MachineRefusalBy, string> = {
  credential: "Too many requests for this client credential.",
  address: "Too many requests from this address.",
  "failed-credentials":
    "Too many requests with an unrecognised client credential from this address. Calls from this address are refused until the window frees room.",
};

/**
 * A machine route's refusal, in the broker's own envelope (respond.ts): the
 * caller is an application that branches on `error.code` and quotes the
 * correlation id, so it gets both, from the edge as from the route. Nothing is
 * audited here — middleware has no database — and the id says as much to
 * whoever looks it up and finds no row: the call never reached the broker.
 *
 * TWO CODES, BECAUSE THE ADVICE DIFFERS. RATE_LIMITED is this credential's own
 * budget: the caller backs off that key. RATE_LIMITED_ADDRESS is the caller's
 * ADDRESS — the backstop, or the failed-lookup bucket — which another key, or
 * another tenant on a shared egress, may have spent; backing off a key that
 * never used its budget does not help, and the developer guide says so.
 */
function machineRefusal(result: RateLimitResult, by: MachineRefusalBy): NextResponse {
  const correlationId = crypto.randomUUID();
  const outage = isLimiterOutage(result);
  return NextResponse.json(
    {
      error: outage
        ? { code: "LIMITER_UNAVAILABLE", message: LIMITER_UNAVAILABLE_MESSAGE, correlationId }
        : {
            code: by === "credential" ? "RATE_LIMITED" : "RATE_LIMITED_ADDRESS",
            message: MACHINE_REFUSAL_MESSAGES[by],
            correlationId,
          },
    },
    {
      status: outage ? 503 : 429,
      headers: {
        "x-correlation-id": correlationId,
        "cache-control": "no-store",
        "Retry-After": retryAfterSeconds(result),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
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

  /*
   * THE MANUAL NEEDS A SESSION, AND THE LAYOUT CANNOT BE THE ONE TO SAY SO.
   *
   * `(help)/layout.tsx` calls getCurrentUser() and redirect(). That is correct
   * for a document request — it answers 307 — and INSUFFICIENT for an RSC flight
   * request, which answers 200 with a payload that contains BOTH a NEXT_REDIRECT
   * instruction AND the fully rendered page. A browser follows the redirect and
   * shows nothing. `curl -H 'RSC: 1'` reads the manual.
   *
   * WHY THIS PAGE AND NOT THE CONSOLE SCREENS, which are gated the same way and
   * do NOT leak: their content needs a database round trip that never happens
   * once the layout redirects, so their flight payload is an empty shell. The
   * manual renders from CONSTANTS with no I/O — the property that made it cheap
   * to serve is exactly what lets it finish rendering before the redirect can
   * matter. "Costs nothing, no I/O" was written as a virtue in the commit that
   * introduced it.
   *
   * So the gate moves to the only place that runs BEFORE anything is rendered or
   * serialised. Middleware cannot verify a session, only detect one — which is
   * the right amount of work here: the layout still does the real check, and
   * this stops an anonymous request reaching the renderer at all.
   */
  if (pathname === '/help' || pathname.startsWith('/help/')) {
    const signedIn =
      request.cookies.has(SESSION_COOKIE) ||
      hasCookieWithPrefix(request, NEXTAUTH_SESSION_COOKIE_PREFIXES);
    if (!signedIn) {
      const target = new URL('/presales/login', request.url);
      // 307 for both document and flight requests. An RSC caller gets a
      // redirect it cannot read past, instead of a 200 it can.
      return NextResponse.redirect(target, 307);
    }
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
      // DERIVED from the same allow-list the Workbench host enforces — the
      // inline copy this used to be drifted, so Studio/Operations/Control
      // Tower pages served the portal's 404 instead of converging on the
      // canonical Workbench URL.
      if (isPageRoute && isWorkbenchOnlyPage(pathname)) {
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

      const machine = await machineRouteLimit(request, pathname, clientIp);
      if (machine) {
        if (!machine.result.allowed) {
          return withObservabilityHeaders(machineRefusal(machine.result, machine.by), requestId, requestStart);
        }
        const response = NextResponse.next({ request: { headers: requestHeaders } });
        response.headers.set("X-RateLimit-Remaining", String(machine.result.remaining));
        return withObservabilityHeaders(response, requestId, requestStart);
      }

      // The governance step-up is not a sign-in: its caller already holds a
      // session, and its routes limit each person themselves. In the shared
      // per-IP sign-in bucket, approvers behind one office address would
      // spend each other's allowance; they fall through to the mutation one.
      const isStepUp = pathname.startsWith("/api/auth/webauthn/step-up/");
      const isAuthMutation = pathname.startsWith("/api/auth") && !isStepUp;
      // Sign-up (P0.13) is an auth mutation with a much tighter budget of its
      // own: each one sends an email from this host's domain and, with
      // developer sign-up open, can create an organization. Per address here;
      // the route adds a per-email bucket the edge cannot key (it has no body).
      const isSignup = pathname === "/api/auth/signup" && request.method === "POST";
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
        : isSignup
        ? RATE_LIMITS.signupPerIp
        : isAuthMutation
        ? RATE_LIMITS.auth
        : isReportRoute
          ? RATE_LIMITS.report
          : request.method === "GET" || request.method === "HEAD"
          ? RATE_LIMITS.apiRead
          : RATE_LIMITS.apiMutation;

      const key = isSapLive
        ? `sap-live:${clientIp}`
        : isSignup
        ? `signup:${clientIp}`
        : isAuthMutation
        ? `auth:${clientIp}`
        : isReportRoute
          ? `report:${clientIp}`
          : `api:${request.method}:${clientIp}`;

      const result = await checkRateLimit(key, config);

      // An outage is not throttling (audit A44): the limiter fails closed in
      // production, and the refusal says why — 503, never 429.
      if (isLimiterOutage(result)) {
        return withObservabilityHeaders(limiterUnavailableResponse(result), requestId, requestStart);
      }

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
