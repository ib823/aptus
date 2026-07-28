import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home" };

/**
 * Operations Center home.
 *
 * DELIBERATELY NOT A DASHBOARD. The obvious thing to put here is a fleet
 * summary — total calls, health tiles, an uptime figure. Every one of those
 * would be a second copy of a number that already has an authoritative source
 * one click away, and a second copy is a thing that disagrees. Worse, a summary
 * tile has nowhere to carry the provenance the real screens carry, so it would
 * state a floor as a fact — which is the failure this whole workspace exists to
 * avoid.
 *
 * So the home page routes rather than summarises, and it is honest about what is
 * built and what is not. When there is a genuine cross-screen number worth
 * showing, it gets an endpoint and a provenance note like everything else.
 */

const BUILT = [
  {
    href: "/operations/traffic",
    title: "Broker traffic",
    detail:
      "Every northbound call, as the audit trail recorded it — outcome, environment binding, and what the feed cannot see.",
  },
  {
    href: "/operations/connections",
    title: "Connections",
    detail:
      "Probe health and environment binding for each active SAP connection, plus the backlog of connections that have not declared a landscape.",
  },
  {
    href: "/operations/incidents",
    title: "Incidents",
    detail:
      "What crossed a threshold, and the named rule that judged it. An empty list is not a claim that all is well.",
  },
] as const;

const NOT_YET = [
  { title: "Write ledger", detail: "reservations and refused writes, from two sources that do not reconcile" },
  { title: "Throttle", detail: "remaining budget per credential, read without spending it" },
  { title: "Tokens", detail: "the runtime credential fleet, and what last-observed use does not tell you" },
] as const;

const card: React.CSSProperties = {
  background: "var(--surface-paper)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(0,0,0,.04)",
  padding: 16,
  display: "block",
};

export default function OperationsHomePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 780 }}>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 24,
            lineHeight: "32px",
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Operations Center
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 14,
            lineHeight: "22px",
            color: "var(--ink-secondary)",
          }}
        >
          Is the live integration healthy right now? Nothing on these screens is estimated. A number
          appears only when a real feed can produce it, and each screen states what its feed cannot
          see.
        </p>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {BUILT.map((s) => (
          <Link key={s.href} href={s.href} style={{ ...card, color: "inherit" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--brand-navy)" }}>
              {s.title}
            </div>
            <p
              style={{
                margin: "5px 0 0",
                fontSize: 13,
                lineHeight: "20px",
                color: "var(--ink-secondary)",
              }}
            >
              {s.detail}
            </p>
          </Link>
        ))}
      </section>

      <section style={{ ...card, background: "var(--surface-ink-tint)" }}>
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            fontWeight: 600,
            color: "var(--ink-secondary)",
          }}
        >
          Not built yet
        </div>
        <p
          style={{
            margin: "6px 0 10px",
            fontSize: 12.5,
            lineHeight: "19px",
            color: "var(--ink-secondary)",
          }}
        >
          Their read endpoints are live and tested; the screens are not. They stay in the rail as
          unavailable rather than hidden, so the shape of the workspace remains legible.
        </p>
        <ul style={{ margin: 0, paddingLeft: 17, display: "flex", flexDirection: "column", gap: 4 }}>
          {NOT_YET.map((s) => (
            <li
              key={s.title}
              style={{ fontSize: 12.5, lineHeight: "19px", color: "var(--ink-secondary)" }}
            >
              <b style={{ fontWeight: 600 }}>{s.title}</b> — {s.detail}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
