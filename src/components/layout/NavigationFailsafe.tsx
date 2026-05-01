"use client";

/**
 * NavigationFailsafe — global listener that catches Next.js App Router
 * navigation failures the framework doesn't surface.
 *
 * Background: when `router.push` triggers an RSC fetch that returns 5xx (or
 * any unhandled rejection during navigation), Next.js drains the action queue
 * silently. The user sees no toast, no console banner — the URL just doesn't
 * change. Forensic diagnosis 2026-05-01.
 *
 * This component listens for `unhandledrejection` at the window level and:
 *   1. Recognises the navigation-failure signature (RSC / Service Unavailable
 *      / Failed to fetch keywords in the rejection reason).
 *   2. Shows a toast so the user gets feedback ("Connection hiccup — please
 *      retry"). Failed navigations correlate to backend 503 spikes worth
 *      investigating server-side.
 *   3. If the rejection carries a target URL, falls back to `window.location`
 *      so the user reaches the page anyway.
 *
 * Mounted once near the top of the portal layout. Companion to `safePush`
 * (see src/lib/navigation/safe-push.ts) — `safePush` is the proactive guard,
 * this is the safety net for cases that slip through.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { isNavInFlight } from "@/lib/navigation/safe-push";

/**
 * Patterns that are unambiguously a navigation failure (always toast).
 *
 * `Connection closed` is the message Next.js throws when an RSC stream is
 * cut mid-flight — exactly the 503-mid-stream signature we care about.
 * `Failed to fetch RSC payload for` is Next.js's primary RSC failure copy.
 * `NetworkError when attempting to fetch resource` is Firefox's flavor.
 * Plain `503` / `Service Unavailable` are belt-and-suspenders for cases
 * where the rejection carries the HTTP status in its message.
 */
const NAV_FAIL_UNAMBIGUOUS = [
  /Failed to fetch RSC payload/i,
  /NetworkError when attempting to fetch/i,
  /Connection closed/i,
  /\b503\b/,
  /Service Unavailable/i,
];

/**
 * Patterns that *can* be navigation failures but also fire in unrelated
 * contexts (analytics aborted on tab close, image loader aborted on
 * navigate-away, React strict-mode dev double-render aborts, etc.).
 *
 * For these we require an in-flight safePush within the last few seconds
 * before treating them as a navigation failure. Otherwise we'd toast on
 * every routine background fetch hiccup.
 */
const NAV_FAIL_AMBIGUOUS = [
  /^Failed to fetch$/i,
  /^TypeError: Failed to fetch$/i,
  /AbortError/i,
];

function classify(reason: unknown): "fire" | "gated" | "ignore" {
  const message =
    typeof reason === "string"
      ? reason
      : ((reason as { message?: string } | undefined)?.message ?? String(reason ?? ""));
  if (NAV_FAIL_UNAMBIGUOUS.some((p) => p.test(message))) return "fire";
  if (NAV_FAIL_AMBIGUOUS.some((p) => p.test(message))) return "gated";
  return "ignore";
}

export function NavigationFailsafe(): null {
  useEffect(() => {
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      const reason = event.reason as { message?: string; url?: string } | string | undefined;
      const verdict = classify(reason);
      if (verdict === "ignore") return;
      // Ambiguous rejections only count when a safePush was recently dispatched,
      // so we don't toast on unrelated background-fetch hiccups.
      if (verdict === "gated" && !isNavInFlight()) return;

      // Show a non-blocking toast so the user knows something happened.
      toast.error("Couldn't load the next page — please retry.", {
        description: "If this keeps happening, refresh the browser.",
        duration: 5000,
      });

      // If the rejection carries a target URL, do a hard navigation as a last
      // resort so the user isn't stuck.
      const target = typeof reason === "object" ? reason?.url : undefined;
      if (target && typeof target === "string") {
        window.location.href = target;
      }

      // Don't let it bubble to the console as an unhandled error.
      event.preventDefault();
    };

    window.addEventListener("unhandledrejection", onUnhandled);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandled);
    };
  }, []);

  return null;
}
