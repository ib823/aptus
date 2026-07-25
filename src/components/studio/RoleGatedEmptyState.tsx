/**
 * RoleGatedEmptyState — what a role that cannot open Developer Studio sees.
 *
 * Deliberately NOT a 404 and NOT a redirect: the workspace exists, the caller
 * simply is not entitled to it, and saying so is both more honest and more useful
 * than pretending the route is missing. It discloses nothing about the tenant's
 * contents — only that a role gate exists and how to get past it.
 */

export function RoleGatedEmptyState({ roleLabel }: { roleLabel: string }) {
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
          Developer Studio is role-gated
        </h1>
        <p style={{ margin: "0 0 4px", fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)" }}>
          Your role ({roleLabel}) does not have access to this workspace. Request access
          from a Platform Admin.
        </p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: "var(--ink-muted)" }}>
          Developer Studio is where SAP integrations are configured, governed, and tested.
        </p>
      </div>
    </div>
  );
}
