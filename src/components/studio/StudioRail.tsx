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
import { RailHighlight } from "./RailHighlight";
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
  { key: "interfaces", label: "Interfaces", href: "/studio/interfaces", available: true },
  { key: "test", label: "Test Console", href: "/studio/test", available: true },
] as const;

/**
 * Operations Center sections. `available` is flipped on as each screen's PR
 * lands, exactly like Studio's — the rail never links somewhere that does not
 * exist yet, it says "not yet" instead.
 */
export const OPERATIONS_SECTIONS: readonly StudioSection[] = [
  { key: "home", label: "Home", href: "/operations", available: true },
  { key: "traffic", label: "Broker traffic", href: "/operations/traffic", available: true },
  { key: "connections", label: "Connections", href: "/operations/connections", available: true },
  { key: "incidents", label: "Incidents", href: "/operations/incidents", available: true },
  { key: "writes", label: "Write ledger", href: "/operations/writes", available: true },
  { key: "throttle", label: "Throttle", href: "/operations/throttle", available: true },
  { key: "tokens", label: "Tokens", href: "/operations/tokens", available: true },
  // Catalogue freshness is deliberately absent, not merely unavailable.
  //
  // It was specified and is not being built: `SapHubContent` has no
  // organizationId, probes are keyed by env tenant, so an organization-scoped
  // freshness view would return empty for every organization while looking like
  // it worked. A rail entry that can never unlock is a promise the product has
  // decided not to keep, and a rail with a permanent dead item teaches people
  // the rail is decorative.
  //
  // It returns if the deployment-scoped respecification is built — see
  // docs/coreedge/ops-control-tower/FRESHNESS-RESPEC.md.
] as const;

/** Control Tower sections, same discipline. */
export const CONTROL_TOWER_SECTIONS: readonly StudioSection[] = [
  { key: "home", label: "Home", href: "/control-tower", available: true },
  { key: "portfolio", label: "Solution portfolio", href: "/control-tower/portfolio", available: true },
  { key: "grants", label: "Access governance", href: "/control-tower/grants", available: true },
  { key: "audit", label: "Governance audit", href: "/control-tower/audit", available: true },
  { key: "connections", label: "Connection register", href: "/control-tower/connections", available: true },
  { key: "tokens", label: "Credential register", href: "/control-tower/tokens", available: true },
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
    // NO background here. The selection is drawn once, by RailHighlight, so it
    // can travel between items — two items painting their own would both look
    // selected mid-transition.
    background: "transparent",
    position: "relative",
    cursor: enabled ? "pointer" : "default",
  };
}

export function StudioRail({
  workspaces,
  accessible,
  sections,
  activeWorkspace,
  workspaceLabel,
}: {
  workspaces: readonly WorkspaceDescriptor[];
  accessible: readonly StudioWorkspace[];
  sections: readonly StudioSection[];
  /**
   * Which workspace the caller is actually in.
   *
   * REQUIRED AND NON-DEFAULTED, so the compiler forces every mount to say. The
   * switcher previously computed `active = w.href === "/studio"` — a literal —
   * so Developer Studio was highlighted on every page of all three workspaces,
   * and the section heading below said "Developer Studio" while listing Control
   * Tower's sections.
   *
   * That is the same defect PR #173 fixed in the breadcrumb, in the component
   * next door. #173 threaded `workspaceLabel` into the top bar and left the rail
   * hardcoded, so half the shell learned which workspace it was in and half did
   * not. Nobody saw it because both new workspaces were unreachable in
   * production until #177, and nothing opened Control Tower until now.
   */
  activeWorkspace: StudioWorkspace;
  /** Derived from `activeWorkspace` by the shell — never passed independently. */
  workspaceLabel: string;
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
        <RailHighlight
          activeKey={workspaces.some((w) => w.key === activeWorkspace) ? activeWorkspace : null}
          // Each workspace is its own route group with its own layout, so this
          // rail unmounts when you move between them. Without a key to remember
          // the last position, the bar would just appear at the new workspace —
          // which is exactly why the switcher did not animate while the section
          // list, which stays mounted inside one layout, did.
          persistAs="workspace"
        >
        <ul style={listStyle}>
          {workspaces.map((w) => {
            const enabled = w.availableInV1 && w.href !== null && accessible.includes(w.key);
            // By KEY, not by a hardcoded href. The literal `"/studio"` here is
            // what highlighted Developer Studio from inside Control Tower.
            const active = w.key === activeWorkspace;
            return (
              <li key={w.key} data-rail-item={w.key}>
                {enabled && w.href ? (
                  <Link
                    href={w.href}
                    style={itemStyle(active, true)}
                    // The highlight is a background colour, which conveys
                    // nothing to a screen reader and nothing to a test. This
                    // states it.
                    aria-current={active ? "page" : undefined}
                  >
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
        </RailHighlight>
      </section>

      <section aria-label={`${workspaceLabel} sections`}>
        <h2 style={groupHeadingStyle}>{workspaceLabel}</h2>
        <RailHighlight activeKey={sections.find((s2) => s2.href === pathname)?.key ?? null}>
        <ul style={listStyle}>
          {sections.map((s) => {
            const active = pathname === s.href;
            return (
              <li key={s.key} data-rail-item={s.key}>
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
        </RailHighlight>
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
