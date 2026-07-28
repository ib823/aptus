/**
 * RoleGatedEmptyState — what a role that cannot open a workspace sees.
 *
 * Deliberately NOT a 404 and NOT a redirect: the workspace exists, the caller
 * simply is not entitled to it, and saying so is both more honest and more useful
 * than pretending the route is missing. It discloses nothing about the tenant's
 * contents — only that a role gate exists and how to get past it.
 *
 * IT NAMES THE WORKSPACE THE CALLER TRIED TO OPEN. All three layouts render this
 * component, and it used to hardcode "Developer Studio" twice — so a support
 * user turned away from Control Tower was told that Developer Studio is
 * role-gated, and then told what Developer Studio is for. A refusal that names
 * the wrong thing reads as a bug in the gate rather than a decision about
 * access, which is the opposite of what an honest refusal should do.
 *
 * `activeWorkspace` is required and non-defaulted, so the compiler forces every
 * mount to say which workspace was refused.
 */

import { WORKSPACES, type StudioWorkspace } from "@/lib/studio/rbac";

export function RoleGatedEmptyState({
  roleLabel,
  activeWorkspace,
}: {
  roleLabel: string;
  activeWorkspace: StudioWorkspace;
}) {
  const descriptor = WORKSPACES.find((w) => w.key === activeWorkspace);
  const label = descriptor?.label ?? "This workspace";
  const purpose = descriptor?.purpose ?? null;
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--surface-cream)",
        color: "var(--ink-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          background: "var(--surface-paper)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card-warm, 12px)",
          boxShadow: "0 1px 2px rgba(0,0,0,.04)",
          padding: 24,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: 20,
            fontWeight: 600,
            lineHeight: "28px",
          }}
        >
          {label} is role-gated
        </h1>
        <p style={{ margin: "0 0 4px", fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)" }}>
          Your role ({roleLabel}) does not have access to this workspace. Request access
          from a Platform Admin.
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--ink-muted)" }}>
          {purpose}
        </p>
      </div>
    </div>
  );
}
