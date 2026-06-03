/**
 * <TerminalScreen> — shared shell for the presales terminal states
 * (design brief §3.9 / §5): /c/expired and /c/ended.
 *
 * Cream full-height surface, centered ABeam Workbench wordmark above a paper
 * card carrying an eyebrow, a serif H1, and body copy. Page-specific content
 * (e.g. <ConsultantContactCard> or a generic fallback) is passed as children
 * and renders inside the card.
 */

import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/Wordmark";

interface TerminalScreenProps {
  eyebrow: string;
  heading: string;
  body: string;
  /** Text alignment of the card copy. Use "center" when there is no body content below. */
  align?: "left" | "center";
  children?: ReactNode;
}

export function TerminalScreen({
  eyebrow,
  heading,
  body,
  align = "left",
  children,
}: TerminalScreenProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--surface-cream, #FAF9F5)",
        padding: "48px 16px",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Wordmark size="md" />
        </div>

        <main
          style={{
            background: "var(--surface-paper, #FFFFFE)",
            border: "1px solid var(--border-default, #E5E1D6)",
            borderRadius: 12,
            padding: "40px 32px",
            boxShadow: "var(--shadow-card-warm, 0 1px 2px rgba(20,20,20,0.04))",
            textAlign: align,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--ink-muted, #8A8A8A)",
              marginBottom: 8,
            }}
          >
            {eyebrow}
          </div>
          <h1
            style={{
              fontFamily: "var(--font-serif), Georgia, serif",
              fontSize: 32,
              lineHeight: 1.2,
              fontWeight: 500,
              margin: 0,
              color: "var(--ink-primary, #1A1A1A)",
            }}
          >
            {heading}
          </h1>
          <p
            style={{
              marginTop: 16,
              marginBottom: 0,
              color: "var(--ink-secondary, #4A4A4A)",
              fontSize: 15,
              lineHeight: 1.55,
            }}
          >
            {body}
          </p>
          {children}
        </main>
      </div>
    </div>
  );
}
