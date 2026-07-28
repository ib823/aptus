import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home" };

/**
 * Control Tower home.
 *
 * NOT A DASHBOARD, for the same reason the Operations Center's home is not one:
 * a summary tile is a second copy of a number that already has an authoritative
 * source one click away, and it has nowhere to carry the provenance the real
 * screens carry. So this routes, and states the one thing worth saying up
 * front — what this workspace can and cannot do.
 *
 * (The previous version carried an `<h1>` reading "Operations Center". It
 * shipped with the console shell and was never seen, because the workspace was
 * unreachable in production until the routing fix — so nobody read the heading
 * that was wrong.)
 */

const SCREENS = [
  {
    href: "/control-tower/portfolio",
    title: "Solution portfolio",
    detail:
      "Every registered solution, and whether anyone is accountable for it. Ownership gates both promotion and credential issuance.",
  },
  {
    href: "/control-tower/grants",
    title: "Access governance",
    detail:
      "What each solution asked to reach, what was decided, and when that decision stops being true. The one place a request can be settled.",
  },
  {
    href: "/control-tower/audit",
    title: "Governance audit",
    detail: "Every change to governed configuration, append-only. Who changed what, and when.",
  },
  {
    href: "/control-tower/connections",
    title: "Connection register",
    detail:
      "The whole SAP estate, active or not — which landscape each connection claims to be, and who may write through it.",
  },
  {
    href: "/control-tower/tokens",
    title: "Credential register",
    detail:
      "Every runtime credential, and whether issuing it was accountable — the segregation-of-duties record.",
  },
] as const;

const card: React.CSSProperties = {
  background: "var(--surface-paper)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(0,0,0,.04)",
  padding: 16,
  display: "block",
};

export default function ControlTowerHomePage() {
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
          Control Tower
        </h1>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 14,
            lineHeight: "22px",
            color: "var(--ink-secondary)",
          }}
        >
          Is the portfolio governed? These are complete records, not samples — every solution,
          connection, credential and decision in scope is listed, and each screen states what it can
          and cannot establish.
        </p>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SCREENS.map((s) => (
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
          What can be done from here
        </div>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 12.5,
            lineHeight: "19px",
            color: "var(--ink-secondary)",
          }}
        >
          One thing: settling an access request, and only a platform admin may do it. Everything else
          is observation. Rotating a credential and enabling write on a connection are real
          capabilities that belong to the builder in Developer Studio — the registers show those
          controls disabled rather than hiding them, because a reviewer needs to know the capability
          exists and who holds it. There is no way to revoke an access grant in this release; an
          approved grant ends by lapsing, which is why a write cannot be approved without an expiry.
        </p>
      </section>
    </div>
  );
}
