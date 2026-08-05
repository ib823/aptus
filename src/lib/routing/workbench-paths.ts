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
  '/api/auth/',         // NextAuth callbacks must work on WORKBENCH_HOST
  '/api/presales/',     // presales REST API
  '/api/affirm/',       // affirm-set REST API
  '/api/discovery/',    // neutral-discovery REST API
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
