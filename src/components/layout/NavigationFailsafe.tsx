"use client";

/**
 * NavigationFailsafe — global listener that catches Next.js App Router
 * navigation failures the framework doesn't surface.
 *
 * Background: when `router.push` triggers an RSC fetch that returns 5xx (or
 * the underlying stream is cut), Next.js drains the action queue silently.
 * The user sees no toast, no console banner — the URL just doesn't change.
 *
 * This component installs three listeners:
 *
 *   1. `window.unhandledrejection` — recognises RSC failure messages and,
 *      if a navigation is currently in flight, shows a toast and (when the
 *      rejection carries a target URL) hard-navigates so the user reaches
 *      the page anyway.
 *   2. `document.click` (capture phase) on any internal `<a>` — marks a
 *      navigation as in flight at click time. This is what tells the
 *      rejection handler "yes, the failure that just fired is for a real
 *      user-initiated navigation, not a stray prefetch or background fetch."
 *   3. `history.pushState` / `history.replaceState` monkey-patch — same
 *      thing for any code path that navigates without going through one of
 *      our `<a>` clicks (programmatic redirects, Next.js's own Link
 *      handlers, router.push/replace from un-converted call sites).
 *
 * Everything is gated on `isNavInFlight()` from `safe-push.ts`. That single
 * gate eliminates the prefetch-storm false-positive class — a `<Link>`
 * prefetch failure for `/templates` will reject with the same message as a
 * real navigation, but if no nav was just initiated, we ignore it.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { isNavInFlight, markNavInFlight } from "@/lib/navigation/safe-push";

/**
 * Patterns that match Next.js App Router navigation/RSC failures.
 *
 * These are the literal error message templates the framework throws —
 * verified against the bundled chunks during the 2026-05-01 forensic audit:
 *
 *   - `Failed to fetch RSC payload for ...`  Next's primary clean-failure copy
 *   - `Connection closed.`                   Stream cut mid-flight (the 503-mid-stream signature)
 *   - `NetworkError when attempting to fetch resource.`  Firefox's network failure
 *   - bare `Failed to fetch`                 Chrome/Edge's generic fetch failure
 *   - `TypeError: Failed to fetch`           Wrapped variant
 *   - `AbortError`                           Fetch cancelled mid-flight
 *
 * NOT included (intentionally): plain `503` / `Service Unavailable` strings.
 * The RSC client never propagates the HTTP status code into the rejection
 * message — these strings would essentially never fire and would create a
 * false sense of coverage. We catch the *symptoms* of 503 (the messages
 * above), not the status code itself.
 *
 * We don't tier these by ambiguity any more — every match is gated on
 * `isNavInFlight()`, which handles disambiguation more reliably than the
 * message text could.
 */
const NAV_FAIL_PATTERNS = [
  /Failed to fetch RSC payload/i,
  /Connection closed/i,
  /NetworkError when attempting to fetch/i,
  /^Failed to fetch$/i,
  /^TypeError: Failed to fetch$/i,
  /AbortError/i,
];

const TOAST_ID = "nav-failure" as const;

function isNavFailureMessage(reason: unknown): boolean {
  const message =
    typeof reason === "string"
      ? reason
      : ((reason as { message?: string } | undefined)?.message ?? String(reason ?? ""));
  return NAV_FAIL_PATTERNS.some((p) => p.test(message));
}

export function NavigationFailsafe(): null {
  useEffect(() => {
    // ── (1) unhandledrejection: the actual failure detector ───────────────
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      if (!isNavFailureMessage(event.reason)) return;
      // Gate: only a real user-initiated navigation should produce a toast.
      // Prefetch / background-fetch failures sharing the same error message
      // are filtered out here.
      if (!isNavInFlight()) return;

      // Toast id dedupes burst failures (during pool exhaustion three RSC
      // requests can fail within a 200 ms window — we want one toast, not three).
      toast.error("Couldn't load the next page — please retry.", {
        id: TOAST_ID,
        description: "If this keeps happening, refresh the browser.",
        duration: 5000,
      });

      // If the rejection carries a target URL, do a hard navigation as a
      // last resort so the user isn't stuck.
      const reasonObj = typeof event.reason === "object" ? event.reason as { url?: string } | null : null;
      const target = reasonObj?.url;
      if (target && typeof target === "string") {
        window.location.href = target;
      }

      // Don't let it bubble to the console as an unhandled error.
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", onUnhandled);

    // ── (2) document click on internal anchors: nav-intent signal ─────────
    // Capture phase so we set the flag *before* Next.js's Link handler runs
    // and starts the async navigation. Same-origin only — clicks on external
    // / mailto: / tel: / hash-only links don't count.
    const onClick = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      // Internal route only — skip externals, mailto:, tel:, javascript:, hash.
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
        return;
      }
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
      } catch {
        return;
      }
      markNavInFlight();
    };
    document.addEventListener("click", onClick, true);

    // ── (3) history hooks: catch programmatic / framework navigations ─────
    // Wrap pushState/replaceState so any navigation — including Next.js's
    // own router.push from un-converted <Link>s, server redirects, the
    // back/forward cache replay path, etc. — refreshes the in-flight window.
    // We restore on unmount to be polite to the next tenant.
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = function patchedPush(...args: Parameters<typeof history.pushState>) {
      markNavInFlight();
      return origPush(...args);
    };
    history.replaceState = function patchedReplace(...args: Parameters<typeof history.replaceState>) {
      markNavInFlight();
      return origReplace(...args);
    };

    return () => {
      window.removeEventListener("unhandledrejection", onUnhandled);
      document.removeEventListener("click", onClick, true);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  }, []);

  return null;
}
