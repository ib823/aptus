/**
 * The Workbench's screen inventory, as plain data.
 *
 * The Console's three workspaces are rail-navigated, so `src/lib/studio/sections.ts`
 * could simply hold the rail. The Workbench is not one shape:
 *
 *   · Process Discovery HAS a rail (DiscoverySiderail), so its sections are the
 *     rail's own items and the rail imports them from here — same arrangement as
 *     the Console, for the same reason spelled out in studio/sections.ts: a
 *     server module cannot read a value out of a `"use client"` module, it gets
 *     a client reference back and `.map` is not a function.
 *
 *   · Affirm and Presales are FLOWS. There is no rail because there is nothing
 *     to navigate to until you have a bundle; you move through stages of one.
 *     Their screens therefore have no single URL — /affirm/{bundle}/questions is
 *     a shape, not an address — which the manual has to render differently
 *     rather than linking somewhere that 404s.
 *
 * `pattern` is what makes both cases checkable. `tests/unit/help/workbench-routes.test.ts`
 * walks the real `app/(workbench)` route tree and asserts each pattern resolves
 * to a page that exists and that no page is left undocumented. That is the same
 * both-directions guarantee the Console gets from its rail, taken from the
 * routes instead — a stronger source, because the routes cannot be out of date
 * with themselves.
 */

export interface WorkbenchSection {
  key: string;
  label: string;
  /**
   * The route, with `{param}` where the path carries an id.
   *
   * Written in the manual's own notation rather than Next's `[id]`, because it
   * is rendered to a reader: "/affirm/{bundle}/questions" reads as an
   * instruction, "/affirm/[id]/questions" reads as a filename.
   */
  pattern: string;
  /** A real, linkable URL — only when the route takes no parameters. */
  href: string | null;
  /** How to get there when there is no link. Null when `href` is set. */
  reachedBy: string | null;
}

/**
 * A route with its parameter NAMES erased, so two spellings of the same route
 * can be compared.
 *
 * The manual writes `/presales/{bundle}/preview/{scopeCode}`; the file tree
 * spells the same route `/presales/[bundleId]/preview/[scopeCode]`. Comparing
 * them literally fails on the names alone, and mapping every parameter to a
 * fixed `[id]` fails on routes with two of them. Both sides collapse to `[]`
 * instead, which compares position and shape — the only things that decide
 * whether a URL reaches this page.
 */
export function normaliseRoute(route: string): string {
  return route.replace(/\{[^}]+\}/g, "[]").replace(/\[[^\]]+\]/g, "[]");
}

/**
 * Process Discovery — the eight rail sections, in rail order.
 *
 * Every one is linkable: Discovery's screens are places, not stages, and the
 * engagement-specific pages hang off Sessions and Outputs rather than replacing
 * them.
 */
export const DISCOVERY_SECTIONS: readonly WorkbenchSection[] = [
  { key: "home", label: "Home", pattern: "/discovery", href: "/discovery", reachedBy: null },
  { key: "library", label: "Library", pattern: "/discovery/library", href: "/discovery/library", reachedBy: null },
  { key: "coverage", label: "Coverage", pattern: "/discovery/coverage", href: "/discovery/coverage", reachedBy: null },
  { key: "sources", label: "Sources", pattern: "/discovery/sources", href: "/discovery/sources", reachedBy: null },
  { key: "sessions", label: "Sessions", pattern: "/discovery/sessions", href: "/discovery/sessions", reachedBy: null },
  { key: "map", label: "Product map", pattern: "/discovery/map", href: "/discovery/map", reachedBy: null },
  { key: "outputs", label: "Outputs", pattern: "/discovery/outputs", href: "/discovery/outputs", reachedBy: null },
  { key: "health", label: "Library health", pattern: "/discovery/health", href: "/discovery/health", reachedBy: null },
] as const;

/**
 * Affirm — the stages of one bundle, in the order a consultant walks them.
 *
 * Only the index and the create screen have addresses. The rest are stages of a
 * bundle, and the bundle's state decides which one you land on: a draft opens at
 * Scope, an issued bundle at the client view, a submitted one at Review, a
 * released one at Output. That redirect chain is the real navigation, which is
 * why there is no rail to derive from.
 */
export const AFFIRM_SECTIONS: readonly WorkbenchSection[] = [
  { key: "list", label: "Bundles", pattern: "/affirm", href: "/affirm", reachedBy: null },
  { key: "new", label: "New bundle", pattern: "/affirm/new", href: "/affirm/new", reachedBy: null },
  {
    key: "scope",
    label: "Scope",
    pattern: "/affirm/{bundle}/scope",
    href: null,
    reachedBy: "Open a draft bundle from Bundles. A bundle that has been issued redirects away from this screen.",
  },
  {
    key: "questions",
    label: "Question editor",
    pattern: "/affirm/{bundle}/questions",
    href: null,
    reachedBy: "Open a bundle from Bundles, then Questions. Editable while the bundle is a draft; read-only once issued.",
  },
  {
    key: "client",
    label: "Client affirm view",
    pattern: "/affirm/{bundle}",
    href: null,
    reachedBy: "Open an issued bundle from Bundles. This is the consultant's view of the screen the client answers.",
  },
  {
    key: "review",
    label: "Review and release",
    pattern: "/affirm/{bundle}/review",
    href: null,
    reachedBy: "Open a submitted bundle from Bundles.",
  },
  {
    key: "output",
    label: "Output",
    pattern: "/affirm/{bundle}/output",
    href: null,
    reachedBy: "Open a released bundle from Bundles.",
  },
] as const;

/**
 * Presales — the bundle a client signs, and what surrounds it.
 *
 * Settings is a real address and belongs to the consultant rather than to any
 * bundle, so it sits last rather than in flow order.
 */
export const PRESALES_SECTIONS: readonly WorkbenchSection[] = [
  { key: "list", label: "Bundles", pattern: "/presales", href: "/presales", reachedBy: null },
  { key: "new", label: "New bundle", pattern: "/presales/new", href: "/presales/new", reachedBy: null },
  {
    key: "bundle",
    label: "Bundle dashboard",
    pattern: "/presales/{bundle}",
    href: null,
    reachedBy: "Open a bundle from Bundles.",
  },
  {
    key: "preview",
    label: "Preview as client",
    pattern: "/presales/{bundle}/preview/{scopeCode}",
    href: null,
    reachedBy: "Open a bundle, then Preview as client on a scope item.",
  },
  {
    key: "audit",
    label: "Audit log",
    pattern: "/presales/{bundle}/audit",
    href: null,
    reachedBy: "Open a bundle, then Audit.",
  },
  {
    key: "change-request",
    label: "Change request",
    pattern: "/presales/{bundle}/change-request",
    href: null,
    reachedBy: "Open a SIGNED bundle, then Change request. Any other state redirects to the dashboard.",
  },
  { key: "settings", label: "Settings", pattern: "/presales/settings", href: "/presales/settings", reachedBy: null },
] as const;
