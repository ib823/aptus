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

const NAV_FAILURE_PATTERNS = /Failed to fetch RSC|503|Service Unavailable|NetworkError when attempting/i;

export function NavigationFailsafe(): null {
  useEffect(() => {
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      const reason = event.reason as { message?: string; url?: string } | string | undefined;
      const message = typeof reason === "string" ? reason : (reason?.message ?? "");
      if (!NAV_FAILURE_PATTERNS.test(message)) return;

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
