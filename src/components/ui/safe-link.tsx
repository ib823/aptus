"use client";

/**
 * SafeLink — drop-in replacement for `next/link` that routes the click
 * through our `safePush` resilience layer instead of Next.js's internal
 * `router.push`.
 *
 * Why: Next.js's `<Link>` runs its own click handler that internally calls
 * `router.push(href)`. When that fails (e.g. RSC payload returns 5xx), the
 * action queue rejects silently and the user sees nothing — no toast, no
 * URL change, no console error. This is exactly the silent-navigation-
 * failure pattern that `safePush` was built to survive (pre-warm, watchdog,
 * hard-nav fallback). Using a vanilla `<Link>` bypasses all of that.
 *
 * How: we still render the underlying `<Link>` so prefetch + accessibility
 * + cmd/ctrl/middle-click open-in-new-tab semantics keep working. Our
 * `onClick` calls `e.preventDefault()` on plain left-clicks (skipping
 * Link's internal navigation) and hands off to `safePush`. Modified clicks
 * (cmd/ctrl/shift/alt/middle-click) fall through to the browser's default
 * so "open in new tab" still works.
 *
 * Use SafeLink anywhere you'd use `<Link>` for in-app navigation that the
 * user clicks. For purely programmatic navigation, prefer `safePush`
 * directly. For static external links, plain `<a>` is fine.
 */

import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { safePush } from "@/lib/navigation/safe-push";

type SafeLinkProps = Omit<LinkProps, "href"> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    href: string;
    children?: React.ReactNode;
    /** When true, pass `replace` semantics through to safePush. */
    replace?: boolean;
  };

function SafeLink({
  href,
  replace = false,
  onClick,
  children,
  ...rest
}: SafeLinkProps) {
  const router = useRouter();

  const handleClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      // Always run the user-provided onClick first (so analytics, tour
      // close handlers, etc. still fire).
      onClick?.(event);
      if (event.defaultPrevented) return;

      // Let modified clicks fall through to the browser default — the
      // user wants to open in a new tab / new window / save target as.
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }

      // Intercept the plain left-click. preventDefault() also stops the
      // <Link> wrapper from running its own dispatchNavigateAction.
      event.preventDefault();
      void safePush(router, href, replace ? { replace: true } : {});
    },
    [onClick, href, replace, router],
  );

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}

export { SafeLink };
export type { SafeLinkProps };
