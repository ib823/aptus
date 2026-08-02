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
        {/*
          THE MANUAL SAYS WHAT IT DOES NOT COVER, because the link that reaches it
          does not. "Help & docs" in the user menu points here from anywhere in the
          product, including screens this manual has never described — so a
          consultant arriving from Affirm would otherwise read twenty pages about a
          workspace they were not in and conclude the help is simply wrong. Naming
          the gap costs a sentence; letting someone discover it costs their trust in
          the pages that ARE accurate.
        */}
        <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: "20px", color: "var(--ink-muted)" }}>
          This covers the CoreEdge Console only — Developer Studio, the Operations Center and
          Control Tower. The consulting workspaces reached from the same menu (Affirm, Presales,
          Discovery, the SAP explorer) and the assessment portal are not documented here yet. On a
          Console screen, the <strong>?</strong> in the top bar opens that screen&rsquo;s own page;
          it is hidden elsewhere rather than linking you somewhere that cannot answer you.
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
            <dd style={{ margin: 0, color: "var(--ink-secondary)" }}>
              {/*
                A workspace whose only gate is a session gets a sentence, not a
                roster. Listing every role would look identical to a roster
                somebody chose, and the difference between "these five roles may
                enter" and "there is no role check" is the whole point.
              */}
              {w.accessBasis === "session"
                ? "Any signed-in user — this workspace has no role gate"
                : w.openTo.join(", ")}
            </dd>
            <dt style={{ color: "var(--ink-muted)" }}>Can change things</dt>
            <dd style={{ margin: 0, color: "var(--ink-secondary)" }}>
              {!w.mutations.possible
                ? "Nobody — this workspace is read-only"
                : w.accessBasis === "session"
                  ? "Any signed-in user"
                  : w.mutations.by.join(", ")}
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
        <h2 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 650 }} id="incident-rules">
          Incident rules
        </h2>
        <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: "20px", color: "var(--ink-secondary)" }}>
          Rendered from the constants the endpoint scores with, not copied from them. If a threshold
          changes, this list changes with it — which is why severities are named constants rather
          than inline checks.
        </p>

        {/*
          A LIST, NOT A TABLE, AND EACH RULE LEADS WITH ITS TITLE.
          This was three prose columns — severity, fires when, why — which dropped
          the two fields a reader arrives with and leaves for. The title is how an
          incident is named on the Operations screen, so without it you cannot look
          up the thing you just saw; `remediation` is the only field that says what
          to do about it. Both were on the rule objects the whole time. Four prose
          columns would not have fitted, so the shape changed instead.
        */}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 18 }}>
          {INCIDENT_REFERENCE.map((r) => (
            <li key={r.id} style={{ borderTop: "1px solid var(--border-default)", paddingTop: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: ".07em",
                    fontWeight: 700,
                    color: "var(--ink-secondary)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: 5,
                    padding: "1px 6px",
                  }}
                >
                  {r.severity}
                </span>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>{r.title}</h3>
              </div>
              <dl style={{ margin: "8px 0 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 14px", fontSize: 13, lineHeight: "20px" }}>
                <dt style={{ color: "var(--ink-muted)", whiteSpace: "nowrap" }}>Fires when</dt>
                <dd style={{ margin: 0, color: "var(--ink-secondary)" }}>{r.firesWhen}</dd>
                <dt style={{ color: "var(--ink-muted)", whiteSpace: "nowrap" }}>Why that severity</dt>
                <dd style={{ margin: 0, color: "var(--ink-secondary)" }}>{r.whyThisSeverity}</dd>
                <dt style={{ color: "var(--ink-muted)", whiteSpace: "nowrap" }}>What to do</dt>
                <dd style={{ margin: 0, color: "var(--ink-secondary)" }}>{r.remediation}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
