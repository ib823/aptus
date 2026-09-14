"use client";

import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";

/**
 * The console's theme, made reachable.
 *
 * A2 SHIPPED A FULL DARK PALETTE AND NOBODY COULD SEE IT. `coreedge-tokens.css`
 * carries a complete dark block — sixty-odd tokens, a v2.1 contrast patch, the
 * note that the rail does not invert, and a measurement of all fifteen pairwise
 * status-ground contrasts — behind `.dark .coreedge`. That selector is correct
 * and has always worked. What was missing is any way for a person to put `.dark`
 * on the page: `next-themes` runs with `attribute="class"` and NOTHING in this
 * product calls `setTheme`. The only route to the dark console was typing
 * `localStorage.setItem("theme", "dark")` into a console, which is what the
 * accessibility spec does and what no user will ever do.
 *
 * THREE OPTIONS, NOT A SWITCH. `enableSystem` is on, so "follow my computer" is
 * a real state and the product's default is `light` — which means a person whose
 * machine is dark still gets light until they say otherwise. A two-way toggle
 * would hide that third state and leave "why doesn't this follow my system?"
 * unanswerable. The current one is marked with `aria-checked`, so it is legible
 * to a screen reader and not only to the eye.
 *
 * IT CHANGES THE WHOLE APP, and says so rather than pretending to be local:
 * `next-themes` writes `.dark` on `<html>`. This is the app's one theme
 * mechanism; a second, console-scoped one would be a second source of truth
 * about what the person asked for.
 *
 * PAGE TOKENS, NOT RAIL TOKENS — and the first version of this file got that
 * backwards. `--rail-active` is `rgba(255,255,255,0.12)`, an alpha fill whose
 * own comment says it composites "over --surface-rail"; on the paper ground of
 * a page header it composites to #FBFAF6, and the white `--ink-on-navy` on top
 * of it measured **1.04:1**. Rail.tsx's header warns about the mirror image of
 * this mistake — page inks on the navy rail — and axe caught both. The selected
 * option now uses `--brand-navy-soft` with `--ink-primary`, a pair that INVERTS
 * with the theme: 14.5:1 in light (#1A1A1A on #E6EBF1) and 12.0:1 in dark
 * (#ECEAE3 on #1B2A40). Nothing here reaches for a rail fill or a status
 * colour; a theme choice is neither a rail nor a status.
 */

const OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export function ThemeToggle(): ReactNode {
  const { theme, setTheme } = useTheme();

  /*
   * The stored choice is not knowable on the server, and `theme` is undefined
   * until next-themes has read it. Rendering a guess would mark one option as
   * current and then silently change it after hydration — a control that lies
   * for one frame about what the person chose. Nothing is marked until it is
   * known.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border-default)] p-0.5"
    >
      {OPTIONS.map((option) => {
        const current = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={current}
            onClick={() => setTheme(option.value)}
            className={
              "rounded-full px-2.5 py-1 text-xs focus-visible:outline focus-visible:outline-2 " +
              "focus-visible:outline-offset-2 focus-visible:outline-focus-ring-navy " +
              (current ? "bg-navy-soft text-ink" : "text-ink-soft")
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
