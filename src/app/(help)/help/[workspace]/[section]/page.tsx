import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MANUAL, manualScreen } from "@/lib/help/manual";

export const dynamic = "force-static";

/**
 * One screen's manual page.
 *
 * Statically generated from `MANUAL`, which is itself assembled from the rail's
 * section lists — so the set of manual pages and the set of screens are the same
 * set by construction, not by anyone remembering.
 */
export function generateStaticParams() {
  return MANUAL.map((m) => {
    const [workspace, section] = m.slug.split("/");
    return { workspace: workspace!, section: section! };
  });
}

interface Params {
  params: Promise<{ workspace: string; section: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { workspace, section } = await params;
  const screen = manualScreen(`${workspace}/${section}`);
  return { title: screen ? `${screen.title} · ${screen.workspaceLabel}` : "Not found" };
}

const card: React.CSSProperties = {
  background: "var(--surface-paper)",
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  boxShadow: "0 1px 2px rgba(0,0,0,.04)",
  padding: 18,
};

export default async function ManualScreenPage({ params }: Params) {
  const { workspace, section } = await params;
  const screen = manualScreen(`${workspace}/${section}`);
  if (!screen) notFound();

  return (
    <article style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <header>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600, color: "var(--ink-muted)" }}>
          {screen.workspaceLabel}
        </div>
        <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>
          {screen.title}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 15, lineHeight: "24px", color: "var(--ink-secondary)" }}>
          {screen.answers}
        </p>

        <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {screen.href ? (
            <Link
              href={screen.href}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--brand-navy)",
                textDecoration: "none",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                padding: "6px 12px",
              }}
            >
              Open {screen.title} →
            </Link>
          ) : (
            // Stated rather than silently omitted: a manual entry for a screen
            // that does not exist yet is more useful than a gap, provided it
            // says so.
            <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
              This screen is not built yet.
            </span>
          )}
          <span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>
            Open to {screen.openTo.join(", ")}
          </span>
        </div>
      </header>

      {/* THE SECTION THIS MANUAL EXISTS FOR. Every Console screen refuses to
          claim something, and a reader who does not know which thing reads the
          refusal as a gap in the product. */}
      <section style={{ ...card, background: "var(--surface-ink-tint)" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600, color: "var(--ink-secondary)" }}>
          What this screen will not tell you
        </h2>
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          {screen.cannotTell.map((c) => (
            <li key={c} style={{ fontSize: 13.5, lineHeight: "21px", color: "var(--ink-secondary)" }}>
              {c}
            </li>
          ))}
        </ul>
      </section>

      {screen.misreadings.length > 0 ? (
        <section style={card}>
          <h2 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 650 }}>
            Things that look like bugs and are not
          </h2>
          <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {screen.misreadings.map((m) => (
              <div key={m.seeing}>
                <dt style={{ fontSize: 13.5, fontWeight: 650 }}>{m.seeing}</dt>
                <dd style={{ margin: "3px 0 0", fontSize: 13.5, lineHeight: "21px", color: "var(--ink-secondary)" }}>
                  {m.means}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <nav aria-label="Other screens in this workspace" style={{ ...card, padding: "14px 18px" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600, color: "var(--ink-muted)" }}>
          Also in {screen.workspaceLabel}
        </h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
          {MANUAL.filter((m) => m.workspace === screen.workspace && m.slug !== screen.slug).map((m) => (
            <li key={m.slug}>
              <Link
                href={`/help/${m.slug}`}
                style={{ fontSize: 13, color: "var(--brand-navy)", textDecoration: "none" }}
              >
                {m.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
