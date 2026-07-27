/**
 * StudioShell — the CoreEdge Console chrome: 220px navy rail + 56px paper top bar
 * over a cream content area, per the approved design and the design tokens.
 *
 * Server component: every input (tenant list, role, user) is resolved on the
 * server from the authenticated session. The interactive pieces (active-path
 * highlighting, tenant selection, account menu) are the two client children.
 */

import type { ReactNode } from "react";
import { StudioRail, type StudioSection } from "./StudioRail";
import { StudioTopBar, type StudioTenantOption } from "./StudioTopBar";
import { WORKSPACES, type StudioWorkspace } from "@/lib/studio/rbac";

export function StudioShell({
  accessibleWorkspaces,
  sections,
  workspaceLabel,
  tenants,
  activeTenantKey,
  roleLabel,
  userEmail,
  children,
}: {
  accessibleWorkspaces: readonly StudioWorkspace[];
  /** The ACTIVE workspace's sections. The shell is shared by all three. */
  sections: readonly StudioSection[];
  /** Names the active workspace in the breadcrumb. */
  workspaceLabel: string;
  tenants: readonly StudioTenantOption[];
  activeTenantKey: string | null;
  roleLabel: string;
  userEmail: string;
  children: ReactNode;
}) {
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
