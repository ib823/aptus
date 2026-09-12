"use client";

import Link from "next/link";
import { useOptimistic, type ReactNode } from "react";

/**
 * Rail (desktop) and TabBar (phone) — the six places, always all six.
 *
 * ROLE GATING NEVER REMOVES A PLACE. Every /coreedge route renders for every
 * signed-in user; only the actions inside change, and each disabled one carries
 * its reason. A rail that hides what you cannot do leaves you unable to find out
 * that it exists, or who to ask — which is how "ask in #coreedge-support"
 * becomes the only path to learning the product has a Requests screen.
 *
 * BADGE COUNTS ARE THE ONE THING HERE THAT MAY BE OPTIMISTIC. The build brief
 * permits optimistic updates for exactly three things: rail badge counts, flow
 * step position, and text the user typed. A count that lags by one until the
 * next fetch is a cosmetic error that corrects itself; a lane status, key,
 * approval or revocation that lags is a lie about the system's state, and none
 * of those are rendered here.
 */

export interface RailPlace {
  readonly href: string;
  readonly label: string;
  /** Phone tab bars have no room for a word. */
  readonly short: string;
}

export interface RailProps {
  readonly places: readonly RailPlace[];
  readonly current: string;
  readonly badges?: Readonly<Record<string, number>>;
  readonly variant?: "rail" | "tabbar";
}

export function Rail({ places, current, badges = {}, variant = "rail" }: RailProps): ReactNode {
  /*
   * Optimistic only in the permitted sense: a caller can push a new count
   * through and it shows immediately. The server's next value replaces it.
   */
  const [shownBadges] = useOptimistic(badges);

  const isTabBar = variant === "tabbar";

  return (
    <nav
      aria-label="CoreEdge"
      className={
        isTabBar
          ? "flex w-full items-stretch justify-between bg-surface-rail"
          : "flex w-[var(--rail-width)] shrink-0 flex-col gap-1 bg-surface-rail p-3"
      }
    >
      {places.map((place) => {
        const active = place.href === current;
        const count = shownBadges[place.href];
        return (
          <Link
            key={place.href}
            href={place.href}
            aria-current={active ? "page" : undefined}
            className={
              (isTabBar
                ? "flex flex-1 flex-col items-center gap-1 px-2 py-3 text-xs "
                : "flex items-center justify-between rounded-[var(--radius-input)] px-3 py-2 text-sm ") +
              /*
               * ON-NAVY INKS, NOT THE PAGE INKS. The rail is the one surface
               * that does not invert — it is navy in both themes — so the inks
               * that serve the page are wrong here. In light, --ink-primary is
               * #1A1A1A and --ink-secondary #4A4A4A: on #002B5C those measure
               * 1.75:1 and 1.57:1, against a 4.5:1 floor. A2 declares
               * --ink-on-navy and --ink-on-navy-muted for exactly this, and the
               * first version of this component reached for the page inks
               * instead. The axe scan in
               * tests/e2e/accessibility.coreedge.auth.spec.ts is what caught it,
               * and it caught it in LIGHT only — dark was fine all along, since
               * --ink-primary is already a light value there.
               */
              (active
                ? "bg-rail-active text-[color:var(--ink-on-navy)] "
                : "text-[color:var(--ink-on-navy-muted)] hover:bg-rail-hover ") +
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring-navy"
            }
          >
            <span>{isTabBar ? place.short : place.label}</span>
            {count === undefined || count === 0 ? null : (
              <span className="rounded-full bg-gate-wait-bg px-2 text-xs text-gate-wait-fg">
                {count}
                <span className="sr-only"> waiting</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
