/** Feature flag infrastructure — checks NEXT_PUBLIC_FF_{FLAG} env vars */

const FLAG_DEFAULTS: Record<string, boolean> = {
  // Hierarchy flags removed — ReviewShell is now the default review experience.
  // Previously: hierarchy_components, review_shell, activity_scoped_fetch, map_default_view
};

export type FeatureFlag = string;

/**
 * Check if a feature flag is enabled.
 * Reads from NEXT_PUBLIC_FF_{FLAG} env var (case-insensitive).
 * Returns false if not set.
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const envKey = `NEXT_PUBLIC_FF_${flag.toUpperCase()}`;
  const value = process.env[envKey];
  if (value === undefined || value === "") {
    return FLAG_DEFAULTS[flag] ?? false;
  }
  return value === "true" || value === "1";
}
