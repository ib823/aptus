/**
 * StudioShell — the CoreEdge Console chrome: 220px navy rail + 56px paper top bar
 * over a cream content area, per the approved design and the design tokens.
 *
 * Server component: every input (tenant list, role, environment) is resolved on
 * the server from the authenticated session. The interactive pieces (active-path
 * highlighting, tenant selection) are the two client children.
 */

import type { ReactNode } from "react";
import { StudioRail, STUDIO_SECTIONS } from "./StudioRail";
import { StudioTopBar, type StudioTenantOption } from "./StudioTopBar";
import { WORKSPACES, type StudioWorkspace } from "@/lib/studio/rbac";

export function StudioShell({
  accessibleWorkspaces,
  tenants,
  activeTenantKey,
  environment,
  roleLabel,
  userEmail,
  children,
}: {
  accessibleWorkspaces: readonly StudioWorkspace[];
  tenants: readonly StudioTenantOption[];
  activeTenantKey: string | null;
  environment: string;
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
        sections={STUDIO_SECTIONS}
      />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <StudioTopBar
          tenants={tenants}
          activeTenantKey={activeTenantKey}
          environment={environment}
          roleLabel={roleLabel}
          userEmail={userEmail}
        />
        <main style={{ flex: 1, padding: 24, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}
