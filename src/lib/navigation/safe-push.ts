/**
 * safePush — resilient wrapper around `router.push` that survives RSC 503s.
 *
 * Background: when Next.js App Router's `router.push(url)` triggers an RSC
 * payload fetch (`?_rsc=...`) and the server returns 5xx, the navigation
 * action's Promise rejects, the queue drains, and **the user sees nothing** —
 * the URL doesn't change, no toast appears, no error fires through any
 * surface the framework provides. Forensic diagnosis 2026-05-01.
 *
 * Resilience strategy (in order):
 *   1. Pre-warm the destination via a manual `fetch(url, {RSC:'1'})`. If that
 *      returns 5xx, skip `router.push` entirely and do a hard navigation
 *      (`window.location.href`) — full reload bypasses the App Router and
 *      reliably loads the route.
 *   2. If the pre-warm succeeds, call `router.push(url)` as normal.
 *   3. Start a 1500 ms watchdog: if `location.pathname` hasn't changed by
 *      then, the App Router silently failed despite a healthy server — fall
 *      back to a hard navigation.
 *
 * The user's perception is "navigation always works" instead of "navigation
 * sometimes silently does nothing."
 *
 * Use this in place of `router.push()` for any user-initiated navigation
 * (sidebar links, stepper buttons, post-save redirects, gated CTAs, etc.).
 * It's not needed for prefetches — those failures are recoverable on click.
 */

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Module-level "navigation in flight" timestamp.
 *
 * Set whenever something *intentionally* triggers a navigation: safePush,
 * any document-level click on an internal anchor, or history.pushState /
 * history.replaceState (so we catch Next.js's own router.push from any
 * un-converted <Link>, programmatic redirects, browser back/forward, etc.).
 *
 * NavigationFailsafe consults this to filter out unhandledrejection events
 * that aren't actually navigation failures — e.g. a prefetch of /templates
 * that 503'd while the user was idle. Without this gate, that prefetch
 * failure would surface as "Couldn't load the next page" even though the
 * user hadn't clicked anything.
 *
 * Window sizing: the verification data showed an RSC fetch that took 48 s
 * (cold start + pool exhaustion). A 3 s window would have already expired
 * when that finally rejected. 10 s covers the realistic worst case without
 * extending the false-positive surface meaningfully.
 */
const NAV_IN_FLIGHT_WINDOW_MS = 10_000;
let navInFlightUntil = 0;

/** Mark a navigation as in flight. Refreshes the window each call. */
export function markNavInFlight(): void {
  navInFlightUntil = Date.now() + NAV_IN_FLIGHT_WINDOW_MS;
}

/** True if a navigation has been initiated within the in-flight window. */
export function isNavInFlight(): boolean {
  return Date.now() < navInFlightUntil;
}

interface SafePushOptions {
  /** Use `replace` semantics instead of `push`. */
  replace?: boolean;
  /** Watchdog timeout in ms before falling back to hard nav. Default 1500. */
  timeoutMs?: number;
  /** Skip the pre-warm check (useful for routes you know are healthy). */
  skipPrewarm?: boolean;
}

export async function safePush(
  router: AppRouterInstance,
  url: string,
  opts: SafePushOptions = {},
): Promise<void> {
  const { replace = false, timeoutMs = 1500, skipPrewarm = false } = opts;

  // 1. Pre-warm: ask the server for the RSC payload up-front so we know if
  // the route is healthy *before* we hand off to the App Router.
  if (!skipPrewarm && typeof window !== "undefined") {
    try {
      const r = await fetch(url, {
        headers: { RSC: "1" },
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!r.ok) {
        // Server is unhealthy for this route — full reload instead of letting
        // the App Router silently fail.
        if (replace) window.location.replace(url);
        else window.location.href = url;
        return;
      }
    } catch {
      // Network error — same fallback.
      if (replace) window.location.replace(url);
      else window.location.href = url;
      return;
    }
  }

  // 2. Hand off to the App Router.
  const start = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
  // Mark nav as in flight so NavigationFailsafe can disambiguate any
  // ambiguous rejection that fires shortly after (AbortError, bare
  // "Failed to fetch") from unrelated background fetches.
  markNavInFlight();
  if (replace) router.replace(url);
  else router.push(url);

  // 3. Watchdog: if the URL didn't change within the budget, the App Router
  // silently failed (e.g. cached error state, race with stale prefetch).
  // Fall back to hard navigation so the user isn't stuck.
  if (typeof window !== "undefined") {
    setTimeout(() => {
      const now = window.location.pathname + window.location.search;
      if (now === start) {
        if (replace) window.location.replace(url);
        else window.location.href = url;
      }
    }, timeoutMs);
  }
}
