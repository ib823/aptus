/**
 * ABeam Workbench — Neutral Process Discovery view modes (brief §6/22 + §8).
 *
 * Three modes over the same routes: Present · Explore · Export. Explore is the
 * default; the mode is chrome, not content — the same view model drives all
 * three, which is what keeps them honest with each other.
 *
 * Persistence (§6/22 "Persists per session"): a `discovery-mode` cookie scoped
 * to Path=/d, alongside the guest session cookie. It is deliberately NOT
 * httpOnly — it is UI state the client component sets, carries no credential,
 * and the worst an attacker can do by forging it is change their own chrome.
 * The server reads it so the first paint is already in the right mode (no
 * flash of Explore before Present).
 *
 * KEYBOARD (§6/22 `P/E/X`, §6/23 `P` = park): `P` is claimed twice. There is no
 * real conflict — outside Present, `P` enters Present; inside Present, you are
 * already there, so `P` parks. `E` and `X` always switch. Logged as D12.
 */

export const DISCOVERY_MODES = ["explore", "present", "export"] as const;
export type DiscoveryMode = (typeof DISCOVERY_MODES)[number];

export const DISCOVERY_MODE_COOKIE = "discovery-mode";
export const DISCOVERY_MODE_COOKIE_PATH = "/d";

const MODE_SET = new Set<string>(DISCOVERY_MODES);

export function isDiscoveryMode(value: string): value is DiscoveryMode {
  return MODE_SET.has(value);
}

/** Fail-safe: anything unrecognised reads as Explore, the default mode. */
export function parseMode(value: string | undefined | null): DiscoveryMode {
  if (!value) return "explore";
  return isDiscoveryMode(value) ? value : "explore";
}

export const MODE_LABELS: Record<DiscoveryMode, string> = {
  present: "Present",
  explore: "Explore",
  export: "Export",
};

/** The §6/22 accelerator for each mode. */
export const MODE_KEYS: Record<DiscoveryMode, string> = {
  present: "p",
  explore: "e",
  export: "x",
};
