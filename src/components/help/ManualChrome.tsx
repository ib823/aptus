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
 * IT IS NOT ROLE-GATED. A reader who cannot open Control Tower can still read
 * what Control Tower is for and who may open it — that is the difference
 * between a permission and a secret, and hiding the documentation would teach
 * people the product is smaller than it is. Every entry states who may open it,
 * computed from the real predicates.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { WORKSPACE_OVERVIEWS } from "@/lib/help/manual";

const RAIL_WIDTH = 264;

export function ManualChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--surface-cream)",
        color: "var(--ink-primary)",
      }}
    >
      <nav
        aria-label="Manual"
        style={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          borderRight: "1px solid var(--border-default)",
          background: "var(--surface-paper)",
          padding: "20px 14px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div style={{ padding: "0 10px" }}>
          <Link
            href="/help"
            style={{
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
      </nav>

      <main style={{ flex: 1, minWidth: 0, padding: "28px 32px 64px" }}>
        <div style={{ maxWidth: 720 }}>{children}</div>
      </main>
    </div>
  );
}
