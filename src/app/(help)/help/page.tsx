import type { Metadata } from "next";
import Link from "next/link";

import { INCIDENT_REFERENCE, WORKSPACE_OVERVIEWS } from "@/lib/help/manual";

export const metadata: Metadata = { title: "Console manual" };

const card: React.CSSProperties = {
  background: "var(--surface-paper)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(0,0,0,.04)",
  padding: 18,
};

export default function ManualIndexPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>
          CoreEdge Console
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: "24px", color: "var(--ink-secondary)" }}>
          One app, three workspaces, three audiences. Each screen states what it can establish and
          what it cannot — this manual is mostly about the second half, because that is the part
          people misread.
        </p>
      </header>

      <section style={{ ...card, background: "var(--surface-ink-tint)" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700 }}>
          The one idea worth reading first
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: "21px", color: "var(--ink-secondary)" }}>
          A number appears on these screens only when a real feed can produce it. Where a feed
          under-reports, the screen says so rather than rounding the gap away. That is why an empty
          incident list does not mean healthy, why a latency figure states what it is averaged over,
          and why some slots show a dash instead of a zero. An absence here is information, not a
          rendering fault.
        </p>
      </section>

      {WORKSPACE_OVERVIEWS.map((w) => (
        <section key={w.key} style={card}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 650 }}>{w.label}</h2>
          <p style={{ margin: "6px 0 12px", fontSize: 13.5, lineHeight: "21px", color: "var(--ink-secondary)" }}>
            {w.purpose}
          </p>

          <dl style={{ margin: "0 0 14px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px", fontSize: 12.5 }}>
            <dt style={{ color: "var(--ink-muted)" }}>Open to</dt>
            <dd style={{ margin: 0, color: "var(--ink-secondary)" }}>{w.openTo.join(", ")}</dd>
            <dt style={{ color: "var(--ink-muted)" }}>Can change things</dt>
            <dd style={{ margin: 0, color: "var(--ink-secondary)" }}>
              {w.mutations.possible ? w.mutations.by.join(", ") : "Nobody — this workspace is read-only"}
            </dd>
          </dl>

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {w.screens.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/help/${s.slug}`}
                  style={{ fontSize: 13.5, fontWeight: 600, color: "var(--brand-navy)", textDecoration: "none" }}
                >
                  {s.title}
                </Link>
                <span style={{ fontSize: 13, color: "var(--ink-secondary)" }}> — {s.answers}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section style={card}>
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 650 }}>Incident rules</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" }}>
          Rendered from the constants the endpoint scores with, not copied from them. If a threshold
          changes, this table changes with it — which is why severities are named constants rather
          than inline checks.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr>
                {["Severity", "Fires when", "Why that severity"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px 6px 0", borderBottom: "1px solid var(--border-default)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {INCIDENT_REFERENCE.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: "8px 10px 8px 0", borderBottom: "1px solid var(--border-default)", verticalAlign: "top", whiteSpace: "nowrap", fontWeight: 600 }}>
                    {r.severity}
                  </td>
                  <td style={{ padding: "8px 10px 8px 0", borderBottom: "1px solid var(--border-default)", verticalAlign: "top", color: "var(--ink-secondary)" }}>
                    {r.firesWhen}
                  </td>
                  <td style={{ padding: "8px 10px 8px 0", borderBottom: "1px solid var(--border-default)", verticalAlign: "top", color: "var(--ink-secondary)" }}>
                    {r.whyThisSeverity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
