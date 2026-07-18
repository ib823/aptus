/**
 * ABeam Workbench — Neutral Process Discovery siderail (brief §2, §5).
 *
 * "deep --brand-navy rail, white stroke icons, 3px --cta-red active indicator" —
 * the one part of the .dc's chrome that already matches the brief.
 *
 * Icons are inline stroke SVG per §12.4 ("no icon-library glyphs, no emoji").
 * The .dc renders `◇ ▤ ◔ ⧉ ⇄ ▶ ⇩ ⚙` as font glyphs, which is conflict #21 —
 * they are also a screen-reader hazard (a `⇄` announces as "left right arrow").
 * Here every icon is decorative and the label is the accessible name.
 *
 * Every section is linked as of PR-6 — each one exists. Through PR-4 the rail
 * showed only what shipped, rather than the .dc's dead nav that navigates to a
 * stub reading "pass 2/3 of the build" (shipped copy admitting the product is
 * unfinished).
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface RailItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const S = { stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const ITEMS: RailItem[] = [
  {
    href: "/discovery",
    label: "Home",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 11 L12 4 L20 11 V20 H4 Z" {...S} />
      </svg>
    ),
  },
  {
    href: "/discovery/library",
    label: "Library",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 5h16M4 10h16M4 15h16M4 20h10" {...S} />
      </svg>
    ),
  },
  {
    href: "/discovery/coverage",
    label: "Coverage",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="8" {...S} />
        <path d="M12 4a8 8 0 0 1 8 8h-8Z" {...S} />
      </svg>
    ),
  },
  {
    href: "/discovery/sources",
    label: "Sources",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 4h9l5 5v11H5z M14 4v5h5" {...S} />
      </svg>
    ),
  },
  {
    href: "/discovery/sessions",
    label: "Sessions",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 6l9 6-9 6z" {...S} />
      </svg>
    ),
  },
  {
    href: "/discovery/map",
    label: "Product map",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 8h11l-2-2M20 16H9l2 2" {...S} />
      </svg>
    ),
  },
  {
    href: "/discovery/outputs",
    label: "Outputs",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" {...S} />
      </svg>
    ),
  },
  {
    href: "/discovery/health",
    label: "Library health",
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 12h4l2-5 3 10 2-5h7" {...S} />
      </svg>
    ),
  },
];

export function DiscoverySiderail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Discovery workbench"
      className="flex w-16 flex-none flex-col items-center gap-1 bg-navy py-4"
    >
      <span className="mb-4 flex size-[26px] items-center justify-center rounded" aria-hidden="true">
        {/* currentColor throughout — the rail sets `text-white`, so the mark has
            no hex of its own and the no-stray-hex guard stays honest. */}
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-white">
          <rect width="24" height="24" rx="4" fill="currentColor" opacity="0.12" />
          <path
            d="M7 18 L12 6 L17 18 M9 14 L15 14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <ul className="flex flex-col items-center gap-1">
        {ITEMS.map((item) => {
          // Exact match for the home link; prefix match for the sections, so a
          // drawer route still lights its parent.
          const active =
            item.href === "/discovery"
              ? pathname === "/discovery"
              : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 w-12 flex-col items-center justify-center gap-0.5 rounded-input border-l-[3px] transition-colors focus-visible:shadow-focus-ring focus-visible:outline-none ${
                  active
                    ? "border-cta bg-white/[0.16] text-white"
                    : "border-transparent text-white/[0.72] hover:bg-white/[0.08]"
                }`}
              >
                {item.icon}
                <span className="text-[8px] font-semibold tracking-[0.02em]">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
