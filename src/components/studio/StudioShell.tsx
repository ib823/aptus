/**
 * StudioShell — the CoreEdge Console chrome: 220px navy rail + 56px paper top bar
 * over a cream content area, per the approved design and the design tokens.
 *
 * Server component: every input (tenant list, role, user) is resolved on the
 * server from the authenticated session. The interactive pieces (active-path
 * highlighting, tenant selection, account menu) are the two client children.
 */

import type { ReactNode } from "react";
import { StudioRail } from "./StudioRail";
import type { StudioSection } from "@/lib/studio/sections";
import { StudioTopBar, type StudioTenantOption } from "./StudioTopBar";
import { WORKSPACES, type StudioWorkspace } from "@/lib/studio/rbac";

export function StudioShell({
  accessibleWorkspaces,
  sections,
  activeWorkspace,
  tenants,
  activeTenantKey,
  roleLabel,
  userEmail,
  children,
}: {
  accessibleWorkspaces: readonly StudioWorkspace[];
  /** The ACTIVE workspace's sections. The shell is shared by all three. */
  sections: readonly StudioSection[];
  /**
   * Which workspace this is — the ONE thing a layout declares about itself.
   *
   * The label used to be passed separately, which let the rail, the section
   * heading and the breadcrumb disagree: the top bar was made workspace-aware
   * in #173 and the rail was not, so Control Tower rendered a Developer Studio
   * highlight and heading above Control Tower's own sections.
   *
   * Deriving the label from the key removes that possibility rather than fixing
   * one instance of it. There is now nothing to keep in sync.
   */
  activeWorkspace: StudioWorkspace;
  tenants: readonly StudioTenantOption[];
  activeTenantKey: string | null;
  roleLabel: string;
  userEmail: string;
  children: ReactNode;
}) {
  const descriptor = WORKSPACES.find((w) => w.key === activeWorkspace);
  // WORKSPACES is exhaustive over StudioWorkspace, so this cannot be missing —
  // the fallback exists so a future key added to the union without a descriptor
  // degrades to a readable label rather than rendering "undefined" in the rail.
  const workspaceLabel = descriptor?.label ?? "CoreEdge Console";

  return (
    <div
      data-studio=""
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--surface-cream)",
        color: "var(--ink-primary)",
      }}
    >
      <StudioRail
        workspaces={WORKSPACES}
        accessible={accessibleWorkspaces}
        sections={sections}
        activeWorkspace={activeWorkspace}
        workspaceLabel={workspaceLabel}
      />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <StudioTopBar
          sections={sections}
          workspaceLabel={workspaceLabel}
          tenants={tenants}
          activeTenantKey={activeTenantKey}
          roleLabel={roleLabel}
          userEmail={userEmail}
        />
        <main style={{ flex: 1, padding: 24, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
