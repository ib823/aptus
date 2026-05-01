"use client";

/**
 * AptusSideRail — left navigation rail (spec §6.1).
 *
 * 64 px collapsed (icons-only) by default. Expands to 240 px on hover (CSS
 * handles the hover expansion via `.a-shell-body:not(.a-expanded) .a-siderail:hover`
 * defined in App-1's globals.css).
 *
 * Active item is determined by `usePathname()` matching the route prefix.
 *
 * Spec §6.1 nav items: Home, Assessments, Templates, Settings, [spacer], Help.
 */

import {
  Home,
  LayoutTemplate,
  ListChecks,
  Settings as SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Match route prefixes — used by isActive(pathname). */
  match: (pathname: string) => boolean;
}

const NAV: NavItem[] = [
  {
    key: "home",
    label: "Home",
    href: "/",
    icon: <Home size={18} />,
    match: (p) => p === "/" || p === "/dashboard",
  },
  {
    key: "assessments",
    label: "Assessments",
    href: "/assessments",
    icon: <ListChecks size={18} />,
    match: (p) => p.startsWith("/assessments") || p.startsWith("/assessment"),
  },
  {
    key: "templates",
    label: "Templates",
    href: "/templates",
    icon: <LayoutTemplate size={18} />,
    match: (p) => p.startsWith("/templates"),
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    icon: <SettingsIcon size={18} />,
    match: (p) => p.startsWith("/settings"),
  },
];

// HELP_ITEM removed 2026-05-01 — /help route doesn't exist; the Link was
// 404-ing on prefetch. Restore once a help destination is shipped.

export function AptusSideRail() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      className="a-siderail"
      aria-label="Main navigation"
      style={{
        background: "var(--aptus-surface)",
        borderRight: "1px solid var(--aptus-border)",
        padding: "12px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        width: 64,
        // The shell's outer grid is `min-height: 100vh`, so when the page
        // content overflows the viewport (e.g. the Scope step list at 2k+
        // rows) the body row — and thus this nav — stretches to the full
        // body height. The flex-1 spacer below then balloons by tens of
        // thousands of pixels and pushes the Help link off-screen.
        // Sticky positioning relative to the (scrolling) document, sized
        // to the viewport minus the 56 px topbar, keeps the rail on
        // screen and lets the spacer collapse to its intended size.
        position: "sticky",
        top: 56,
        height: "calc(100vh - 56px)",
        overflow: "hidden",
        transition: "width 200ms ease-in-out",
      }}
    >
      {NAV.map((item) => (
        <SideRailItem key={item.key} item={item} active={item.match(pathname)} />
      ))}

      <div style={{ flex: 1 }} />
    </nav>
  );
}

function SideRailItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      title={item.label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 40,
        padding: "0 10px",
        borderRadius: 6,
        color: active ? "var(--aptus-text)" : "var(--aptus-text-muted)",
        background: active ? "var(--aptus-surface-2)" : "transparent",
        fontSize: 14,
        fontWeight: active ? 500 : 400,
        whiteSpace: "nowrap",
        textDecoration: "none",
        transition: "background 100ms, color 100ms",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--aptus-surface-2)";
          e.currentTarget.style.color = "var(--aptus-text)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--aptus-text-muted)";
        }
      }}
    >
      <span style={{ flexShrink: 0 }}>{item.icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
    </Link>
  );
}
