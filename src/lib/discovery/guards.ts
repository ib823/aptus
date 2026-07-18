/**
 * ABeam Workbench — Neutral Process Discovery feature flag.
 *
 * Mirrors isAffirmExternalEnabled() exactly. Unset ⇒ every (external)/d/* route
 * 404s and the workbench discovery section hides. Rollback is unsetting it:
 * instant, pure UI + routes, no destructive migration.
 */

/** The master kill-switch. Every /d/* page and the workbench section are off unless this is on. */
export function isNeutralDiscoveryEnabled(): boolean {
  return process.env.NEUTRAL_DISCOVERY_ENABLED === "true";
}
