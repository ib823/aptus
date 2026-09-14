import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/coreedge/primitives/ThemeToggle";
import { Rail } from "@/components/coreedge/Rail";

/**
 * The chrome every /coreedge screen sits in.
 *
 * SIX PLACES, ALWAYS SIX. Role does not remove one — a rail that hides what you
 * cannot do leaves you unable to find out the feature exists or who to ask, and
 * "ask in #coreedge-support" becomes the only route to learning the product has
 * a Requests screen. What varies inside is which actions are enabled and what
 * reason each disabled one carries.
 *
 * THE RAIL RUNS THE FULL HEIGHT, which took a `flex` and not a `block`. The
 * wrapper was `hidden sm:block`: it stretched, being a flex item, and the `nav`
 * inside a block container did not, so the navy band stopped after six links.
 * Measured in Chromium against the app's own stylesheet — 260 px of rail in a
 * 900 px shell at 1440×900, and 260 in 1080 at 1920×1080. `sm:flex` makes the
 * wrapper a flex container, the nav stretches, and both come back exact.
 */

export const COREEDGE_PLACES = [
  { href: "/coreedge", label: "Home", short: "Home" },
  { href: "/coreedge/catalogue", label: "Catalogue", short: "Cat" },
  { href: "/coreedge/requests", label: "Requests", short: "Req" },
  { href: "/coreedge/operations", label: "Operations", short: "Ops" },
  { href: "/coreedge/sap-systems", label: "SAP systems", short: "SAP" },
  { href: "/coreedge/passport", label: "Passport", short: "Pass" },
] as const;

export interface CoreEdgeShellProps {
  readonly current: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly badges?: Readonly<Record<string, number>>;
  readonly children: ReactNode;
}

export function CoreEdgeShell({
  current,
  title,
  subtitle,
  badges = {},
  children,
}: CoreEdgeShellProps): ReactNode {
  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <div className="hidden sm:flex">
        <Rail places={[...COREEDGE_PLACES]} current={current} badges={badges} />
      </div>

      <main className="flex min-w-0 flex-1 flex-col gap-6 p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-medium text-ink">{title}</h1>
            {subtitle === undefined ? null : (
              <p className="max-w-prose text-sm text-ink-soft">{subtitle}</p>
            )}
          </div>
          {/*
            NOT A SEVENTH PLACE IN THE RAIL. The rail is the six places, always
            all six, and a test holds it to exactly that list — a theme control
            there would be a navigation item that navigates nowhere. It sits in
            the header instead, where it is reachable on every console screen
            without joining the set it does not belong to.
          */}
          <ThemeToggle />
        </header>
        {children}
      </main>

      {/* The phone tab bar is the same six places, same order, same component. */}
      <div className="sticky bottom-0 sm:hidden">
        <Rail places={[...COREEDGE_PLACES]} current={current} badges={badges} variant="tabbar" />
      </div>
    </div>
  );
}
