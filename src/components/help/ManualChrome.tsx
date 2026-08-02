"use client";

/**
 * The manual's own chrome.
 *
 * DELIBERATELY NOT THE WORKSPACE SHELL. Reading the manual is a different mode
 * from operating the product, and borrowing the workspace rail would raise a
 * question with no honest answer: which workspace are you "in" while reading
 * about all three? So the manual has its own navigation, and a visible way back
 * to wherever you came from.
 *
 * THE WAY BACK NOW EXISTS. That last clause was a description of an intention:
 * the rail linked to /help and to each page, and nothing led out. You arrive
 * here from the "?" in a workspace top bar or from "Help & docs" in the user
 * menu, read one paragraph, and then have only the browser's Back button —
 * which is exactly the moment a reader decides the manual is a dead end. It
 * uses history rather than a fixed link because the honest answer to "back to
 * where?" is "where you came from", and that differs per reader. When there is
 * no history to return to — someone opened a shared link straight into the
 * manual — it offers the Console instead of a control that would do nothing.
 *
 * IT IS NOT ROLE-GATED. A reader who cannot open Control Tower can still read
 * what Control Tower is for and who may open it — that is the difference
 * between a permission and a secret, and hiding the documentation would teach
 * people the product is smaller than it is. Every entry states who may open it,
 * computed from the real predicates.
 *
 * THE RAIL COLLAPSES RATHER THAN CROWDING. It was a fixed 264 px column beside
 * the content at every width, so on a phone it took most of the screen and left
 * the prose in a gutter. Below 900 px it becomes a wrapping row above the page.
 * Media queries need real CSS, which is why this one component carries a style
 * element while the pages it wraps stay on inline styles.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { WORKSPACE_OVERVIEWS } from "@/lib/help/manual";

const CHROME_CSS = `
.manual-shell { display: flex; min-height: 100vh; }
.manual-rail {
  width: 264px; flex-shrink: 0;
  border-right: 1px solid var(--border-default);
  padding: 20px 14px 40px;
  display: flex; flex-direction: column; gap: 22px;
}
/* The sections carry their own spacing so the rail's gap is not the only thing
   holding them apart — it applies to this wrapper, not to its children. */
.manual-rail-groups { display: flex; flex-direction: column; gap: 22px; }
.manual-main { flex: 1; min-width: 0; padding: 28px 32px 64px; }
.manual-main > div { max-width: 720px; }
@media (max-width: 900px) {
  .manual-shell { display: block; }
  .manual-rail {
    width: auto; border-right: none;
    border-bottom: 1px solid var(--border-default);
    padding: 14px 16px 16px; gap: 14px;
  }
  /* Sections sit side by side instead of stacking into a tall wall of links. */
  .manual-rail-groups { flex-direction: row; flex-wrap: wrap; gap: 14px 26px; }
  .manual-main { padding: 20px 16px 56px; }
}
`;

/**
 * Back to wherever the reader came from.
 *
 * `history.length > 1` is read after mount, never during render: it is a
 * browser fact, and consulting it while rendering would make the server and the
 * client disagree about which control to draw.
 */
function BackControl() {
  const router = useRouter();
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    setHasHistory(typeof window !== "undefined" && window.history.length > 1);
  }, []);

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    marginLeft: -8,
    borderRadius: 7,
    border: "none",
    background: "transparent",
    font: "inherit",
    fontSize: 12.5,
    color: "var(--ink-secondary)",
    textDecoration: "none",
    cursor: "pointer",
  };

  if (!hasHistory) {
    return (
      <Link href="/studio" style={style}>
        <span aria-hidden="true">←</span> Go to the Console
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => router.back()} style={style}>
      <span aria-hidden="true">←</span> Back
    </button>
  );
}

export function ManualChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      className="manual-shell"
      style={{ background: "var(--surface-cream)", color: "var(--ink-primary)" }}
    >
      <style>{CHROME_CSS}</style>
      <nav
        aria-label="Manual"
        className="manual-rail"
        style={{ background: "var(--surface-paper)" }}
      >
        <div style={{ padding: "0 10px" }}>
          <BackControl />
          <Link
            href="/help"
            style={{
              display: "block",
              marginTop: 6,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: "var(--ink-primary)",
              textDecoration: "none",
            }}
          >
            Console manual
          </Link>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>
            Every screen, and what it will not tell you
          </div>
        </div>

        <div className="manual-rail-groups">
        {WORKSPACE_OVERVIEWS.map((w) => (
          <section key={w.key}>
            <h2
              style={{
                margin: "0 0 6px",
                padding: "0 10px",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--ink-muted)",
              }}
            >
              {w.label}
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {w.screens.map((s) => {
                const href = `/help/${s.slug}`;
                const active = pathname === href;
                return (
                  <li key={s.slug}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      style={{
                        display: "block",
                        padding: "6px 10px",
                        borderRadius: 8,
                        fontSize: 13,
                        lineHeight: "20px",
                        textDecoration: "none",
                        fontWeight: active ? 600 : 500,
                        color: active ? "var(--brand-navy)" : "var(--ink-secondary)",
                        background: active ? "var(--brand-navy-soft, #E6EBF1)" : "transparent",
                      }}
                    >
                      {s.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        </div>
      </nav>

      <main className="manual-main">
        <div>{children}</div>
      </main>
    </div>
  );
}
