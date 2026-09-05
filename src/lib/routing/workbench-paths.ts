/**
 * Which path prefixes the Workbench owns.
 *
 * Extracted from middleware.ts so the allow-list is testable. It is a routing
 * GATE, not decoration: on a Workbench deployment anything absent from this list
 * is redirected away before the route ever runs — before auth, before RBAC.
 *
 * That failure mode is quiet and easy to misread. CoreEdge Console shipped
 * across nineteen PRs and was unreachable in production the whole time, because
 * `/studio` was missing here and every page-level test ran against a local
 * server where WORKBENCH_ONLY is unset. A page can be complete, tested and
 * deployed and still be behind a locked door.
 *
 * IT THEN HAPPENED AGAIN. Operations Center and Control Tower shipped with route
 * groups, layouts, RBAC and passing tests — and redirected to /workbench in
 * production, because they were not added here either. The warning above was
 * already written at the time. A test asserting the paths exist is therefore
 * below, so the next surface fails CI instead of failing silently in production.
 *
 * Adding a surface to the Workbench means adding it here.
 *
 * Edge-runtime safe: pure data and one pure function, no Node built-ins.
 */

export const WORKBENCH_PATHS = [
  '/workbench',         // Workbench home / hub (auth-gated under (workbench))
  '/sap-explorer',      // SAP Operations — live S/4HANA Cloud TDD explorer
  '/presales',          // consultant surface (auth-gated under (workbench))
  '/affirm',            // value-stream affirm-set workbench
  '/discovery',         // neutral (APQC) process-discovery workbench — feature-gated by NEUTRAL_DISCOVERY_ENABLED
  '/tobe',              // To-Be Process Pack (2608 WS6) — feature-gated by TOBE_PACK_ENABLED
  '/studio',            // CoreEdge Console — Developer Studio (auth + RBAC-gated under (studio))
  '/operations',        // CoreEdge Console — Operations Center (auth + RBAC-gated under (operations))
  '/control-tower',     // CoreEdge Console — Control Tower (auth + RBAC-gated under (control-tower))
  '/c/',                // presales guest token surface (under (external))
  '/a/',                // affirm external executive guest surface (under (external))
  '/d/',                // discovery external guest journey (under (external)) — feature-gated by NEUTRAL_DISCOVERY_ENABLED
  '/signup',            // self-service signup — the acquisition funnel must survive WORKBENCH_ONLY
  '/pricing',           // plan tiers; CTAs link to /signup
  '/terms',             // linked from signup and guest consent surfaces
  '/privacy',           // linked from signup and guest consent surfaces
  /*
   * THE PAGES THE WORKBENCH SURFACES SEND PEOPLE TO. Each of these lives
   * outside the Workbench route groups and was redirected to /workbench on a
   * Workbench host — the gate's fourth silent failure:
   *   - /verify-mfa: the Studio, Operations and Control Tower layouts redirect
   *     an MFA-required user here, so any organization with mfaPolicy=required
   *     was locked out of the whole Console;
   *   - /settings/security: the same layouts send a user who must enrol a
   *     passkey here, and the login-notify emails link to it;
   *   - /invitations/: every invitation email links here;
   *   - /verify/: the sign-off verification link in the presales journey.
   */
  '/verify-mfa',        // MFA step-up target of the Console layouts (under (auth))
  '/settings/security', // passkey enrolment target of the Console layouts + security emails
  '/invitations/',      // invitation-email landing (under (auth))
  '/verify/',           // sign-off verification link (under (public))
  '/api/auth/',         // NextAuth callbacks must work on WORKBENCH_HOST
  '/api/presales/',     // presales REST API
  '/api/affirm/',       // affirm-set REST API
  '/api/discovery/',    // neutral-discovery REST API
  '/api/tobe/',         // To-Be Process Pack REST API (generate / export)
  '/api/studio/',       // CoreEdge Console REST API
  '/help',              // CoreEdge Console manual — not role-gated, see (help)/layout
  '/api/ops/',          // CoreEdge Console — Operations Center read endpoints
  '/api/health',        // probes
  '/_next/',            // build assets
  '/icons/',            // brand assets
  '/favicon',           // favicon variants
  '/manifest.json',
  '/sw.js',
] as const;

/** True when the Workbench owns this path on a Workbench host. */
export function isWorkbenchPath(pathname: string): boolean {
  if (pathname === '/presales' || pathname === '/presales/login') return true;
  if (pathname === '/affirm') return true;
  return WORKBENCH_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * Pages BOTH hosts serve — never cross-host redirected. Marketing and legal
 * pages exist on the portal too; redirecting them off-host would break the
 * portal's own funnel.
 */
const SHARED_HOST_PAGES = ['/signup', '/pricing', '/terms', '/privacy'] as const;

/**
 * True when a PAGE request on the portal host should converge on the
 * Workbench host.
 *
 * DERIVED from `isWorkbenchPath`, one fact one place. The middleware used to
 * keep its own inline list here — presales, affirm, /c/, /a/ — and it
 * drifted exactly like the allow-list above once did: Studio, Operations
 * Center and Control Tower pages opened on the portal host served the portal's
 * 404 instead of converging on the canonical Workbench URL, because the second
 * copy of the fact was not updated when the first was.
 *
 * API routes and assets are the caller's business to exclude (they stay on
 * whichever host the request arrived on); this function answers only for pages.
 */
export function isWorkbenchOnlyPage(pathname: string): boolean {
  // Bare guest-surface segments: startsWith('/c/') misses exactly '/c'.
  if (pathname === '/c' || pathname === '/a' || pathname === '/d') return true;
  if (!isWorkbenchPath(pathname)) return false;
  if (pathname.startsWith('/api/')) return false;
  if (SHARED_HOST_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return true;
}
