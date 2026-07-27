import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home" };

/**
 * Operations Center home — deliberately empty, and saying so.
 *
 * The chrome, the role gate and the tenant resolution are real from this PR;
 * the screens are not. Rendering an invented fleet summary here would be the
 * exact failure this workspace exists to prevent, so the page states what it
 * cannot yet show instead of showing something it cannot back.
 */
export default function OperationsHomePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          Operations Center
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)" }}>
          Is the live integration healthy right now? Broker traffic, connection health, write
          activity and incidents for the integrations you support.
        </p>
      </div>

      <section
        style={{
          background: "var(--surface-paper)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card-warm, 12px)",
          boxShadow: "0 1px 2px rgba(0,0,0,.04)",
          padding: 20,
        }}
      >
        <h2 style={{ margin: "0 0 8px", fontSize: 16, lineHeight: "24px", fontWeight: 600 }}>
          The screens arrive next
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: "22px", color: "var(--ink-secondary)" }}>
          This workspace, its role gate and its tenant switcher are live. The views themselves —
          broker traffic, the write ledger, connection health, catalogue freshness, throttle,
          tokens and incidents — are built on read endpoints that do not exist yet, and are
          listed in the rail as unavailable until each one lands.
        </p>
        <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: "20px", color: "var(--ink-muted)" }}>
          Nothing here is estimated or sampled. A number appears on these screens only when a
          real feed can produce it.
        </p>
      </section>
    </div>
  );
}
