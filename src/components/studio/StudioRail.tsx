"use client";

/**
 * StudioRail — the 220px navy workspace rail.
 *
 * Two stacked groups, matching the approved design:
 *   1. Workspace switcher — Developer Studio / Operations Center / Control Tower.
 *      A workspace the role cannot open, or that is not built in v1, renders
 *      LOCKED (🔒) rather than as a working link. It is never silently hidden:
 *      the developer should be able to see that the workspace exists and is not
 *      theirs, which is also what the design shows.
 *   2. The active workspace's sections.
 *
 * Sections that have not shipped yet render disabled for the same reason — a rail
 * entry that 404s is worse than one that says "not yet". Each subsequent PR flips
 * its own section to `available`.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { StudioWorkspace, WorkspaceDescriptor } from "@/lib/studio/rbac";

export interface StudioSection {
  key: string;
  label: string;
  href: string;
  /** False → shipped in a later PR; render disabled instead of linking to a 404. */
  available: boolean;
}

/**
 * The seven Developer Studio sections, in design order. `available` is flipped on
 * as each screen's PR lands, so the rail never links somewhere that does not exist.
 */
export const STUDIO_SECTIONS: readonly StudioSection[] = [
  { key: "home", label: "Home", href: "/studio", available: true },
  { key: "discover", label: "Discover", href: "/studio/discover", available: true },
  { key: "solutions", label: "Solutions", href: "/studio/solutions", available: true },
  { key: "connections", label: "Connections", href: "/studio/connections", available: true },
  { key: "access", label: "API Access", href: "/studio/access", available: true },
  { key: "interfaces", label: "Interfaces", href: "/studio/interfaces", available: false },
  { key: "test", label: "Test Console", href: "/studio/test", available: false },
] as const;

const RAIL_WIDTH = 220;

function itemStyle(active: boolean, enabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 36,
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    lineHeight: "20px",
    textDecoration: "none",
    color: enabled ? "#FFFFFE" : "rgba(255,255,254,0.45)",
    background: active ? "rgba(255,255,254,0.14)" : "transparent",
    cursor: enabled ? "pointer" : "default",
  };
}

export function StudioRail({
  workspaces,
  accessible,
  sections,
}: {
  workspaces: readonly WorkspaceDescriptor[];
  accessible: readonly StudioWorkspace[];
  sections: readonly StudioSection[];
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="CoreEdge Console"
      data-studio-rail=""
      style={{
        width: RAIL_WIDTH,
        flexShrink: 0,
        background: "var(--brand-navy)",
        color: "#FFFFFE",
        display: "flex",
        flexDirection: "column",
        gap: 24,
        padding: "16px 12px",
        minHeight: "100vh",
      }}
    >
      <div style={{ padding: "4px 12px" }}>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>
          CoreEdge Console
        </span>
      </div>

      <section aria-label="Workspaces">
        <h2 style={groupHeadingStyle}>Workspace</h2>
        <ul style={listStyle}>
          {workspaces.map((w) => {
            const enabled = w.availableInV1 && w.href !== null && accessible.includes(w.key);
            const active = enabled && w.href === "/studio";
            return (
              <li key={w.key}>
                {enabled && w.href ? (
                  <Link href={w.href} style={itemStyle(active, true)}>
                    {w.label}
                  </Link>
                ) : (
                  <span
                    style={itemStyle(false, false)}
                    title={
                      w.availableInV1
                        ? "This workspace is not available to your role"
                        : "This workspace is not built yet"
                    }
                  >
                    {w.label}
                    <span aria-label="locked" role="img" style={{ fontSize: 11 }}>
                      🔒
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Developer Studio sections">
        <h2 style={groupHeadingStyle}>Developer Studio</h2>
        <ul style={listStyle}>
          {sections.map((s) => {
            const active = pathname === s.href;
            return (
              <li key={s.key}>
                {s.available ? (
                  <Link href={s.href} style={itemStyle(active, true)} aria-current={active ? "page" : undefined}>
                    {s.label}
                  </Link>
                ) : (
                  <span style={itemStyle(false, false)} title="This section is not built yet">
                    {s.label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </nav>
  );
}

const groupHeadingStyle: React.CSSProperties = {
  margin: "0 0 8px",
  padding: "0 12px",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "rgba(255,255,254,0.6)",
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};
