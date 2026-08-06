/**
 * The Console rail's sections — the screen inventory, as plain data.
 *
 * WHY THIS IS NOT IN StudioRail.tsx, WHERE IT USED TO LIVE. StudioRail is a
 * `"use client"` module. When a server-evaluated module imports a value from a
 * client module, Next.js does not give it the value: it gives back a client
 * REFERENCE, a placeholder React resolves later on the browser. Passed straight
 * through as a prop that works — which is why the three layouts have always
 * been fine. Read on the server it does not, because a client reference has no
 * `.map`.
 *
 * That is what broke the production build the first time the manual tried to
 * derive its screen list from these arrays: `SECTION_LISTS[w.key].map(...)`
 * threw `.map is not a function` during `next build`, after typecheck, lint and
 * 4928 tests had all passed. Vitest has no notion of `"use client"`, so in the
 * test environment the import returns the real arrays and everything agrees.
 *
 * So the inventory lives here, in a module with no directive, and both sides
 * import the same real data. `tests/unit/studio/lib-layering.test.ts` keeps
 * `src/lib` free of client-module imports so this cannot come back by a
 * different door.
 */

export interface StudioSection {
  key: string;
  label: string;
  href: string;
  /** False → shipped in a later PR; render disabled instead of linking to a 404. */
  available: boolean;
  /**
   * True → the screen is deployment-scoped and platform_admin-gated, so the
   * layout removes it from the rail for everyone else. An org-scoped user must
   * never see the entry at all: a rail item that always refuses them is a
   * promise the product has decided not to keep for that persona.
   */
  adminOnly?: boolean;
}

/**
 * The seven Developer Studio sections, in design order. `available` is flipped on
 * as each screen's PR lands, so the rail never links somewhere that does not exist.
 */
export const STUDIO_SECTIONS: readonly StudioSection[] = [
  { key: "home", label: "Home", href: "/studio", available: true },
  { key: "discover", label: "Discover", href: "/studio/discover", available: true },
  { key: "solutions", label: "Solutions", href: "/studio/solutions", available: true },
  { key: "connections", label: "Connections", href: "/studio/connections", available: true },
  { key: "access", label: "API Access", href: "/studio/access", available: true },
  { key: "interfaces", label: "Interfaces", href: "/studio/interfaces", available: true },
  { key: "test", label: "Test Console", href: "/studio/test", available: true },
] as const;

/**
 * Operations Center sections. `available` is flipped on as each screen's PR
 * lands, exactly like Studio's — the rail never links somewhere that does not
 * exist yet, it says "not yet" instead.
 */
export const OPERATIONS_SECTIONS: readonly StudioSection[] = [
  { key: "home", label: "Home", href: "/operations", available: true },
  { key: "traffic", label: "Broker traffic", href: "/operations/traffic", available: true },
  { key: "connections", label: "Connections", href: "/operations/connections", available: true },
  { key: "incidents", label: "Incidents", href: "/operations/incidents", available: true },
  { key: "writes", label: "Write ledger", href: "/operations/writes", available: true },
  { key: "throttle", label: "Throttle", href: "/operations/throttle", available: true },
  { key: "tokens", label: "Tokens", href: "/operations/tokens", available: true },
  // Catalogue health — built per the RESPECIFICATION, not the original spec.
  //
  // The org-scoped version was refused: `SapHubContent` has no organizationId
  // and probes are keyed by tenant, so it would have returned empty for every
  // organization while looking like it worked. This entry is the
  // deployment-scoped, platform_admin-gated panel FRESHNESS-RESPEC.md called
  // for instead; `adminOnly` keeps it off every other persona's rail entirely
  // — see docs/coreedge/ops-control-tower/FRESHNESS-RESPEC.md.
  {
    key: "catalogue",
    label: "Catalogue health",
    href: "/operations/catalogue",
    available: true,
    adminOnly: true,
  },
] as const;

/** Control Tower sections, same discipline. */
export const CONTROL_TOWER_SECTIONS: readonly StudioSection[] = [
  { key: "home", label: "Home", href: "/control-tower", available: true },
  { key: "portfolio", label: "Solution portfolio", href: "/control-tower/portfolio", available: true },
  { key: "grants", label: "Access governance", href: "/control-tower/grants", available: true },
  { key: "audit", label: "Governance audit", href: "/control-tower/audit", available: true },
  { key: "connections", label: "Connection register", href: "/control-tower/connections", available: true },
  { key: "tokens", label: "Credential register", href: "/control-tower/tokens", available: true },
] as const;
