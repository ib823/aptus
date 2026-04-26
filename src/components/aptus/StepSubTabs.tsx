"use client";

/**
 * StepSubTabs — secondary navigation strip rendered under the StepRail when
 * the active step has more than one routable surface.
 *
 * Replaces the legacy AssessmentTabNav (SAP-Horizon styled, hidden on mobile)
 * with an Aptus-tokenised tab strip that's visible on every viewport. The
 * AptusAssessmentShell decides which tabs to show based on the active step.
 *
 * Locked tabs render disabled with an optional title attribute carrying the
 * reason — used to gate the Scope step's sub-tabs while the Profile is
 * incomplete.
 */

import Link from "next/link";

export interface StepSubTab {
  /** Display label. */
  label: string;
  /** Absolute href (under /assessment/{id}). */
  href: string;
  /** Disable navigation; render as plain text with reduced opacity. */
  disabled?: boolean;
  /** Title attribute shown on hover when disabled. */
  disabledReason?: string;
}

interface StepSubTabsProps {
  items: StepSubTab[];
  /** The current pathname (from usePathname). */
  activeHref: string;
}

export function StepSubTabs({ items, activeHref }: StepSubTabsProps) {
  if (items.length <= 1) return null;

  return (
    <nav
      aria-label="Step sub-navigation"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "8px 0",
        borderTop: "1px solid var(--aptus-border)",
        overflowX: "auto",
      }}
    >
      {items.map((item) => {
        const isActive =
          activeHref === item.href || activeHref.startsWith(`${item.href}/`);
        const baseStyle = {
          display: "inline-flex",
          alignItems: "center",
          padding: "6px 12px",
          borderRadius: 6,
          fontSize: 13,
          fontWeight: isActive ? 600 : 500,
          textDecoration: "none",
          fontFamily: "inherit",
          whiteSpace: "nowrap" as const,
          transition: "background 120ms",
        };

        if (item.disabled) {
          return (
            <span
              key={item.href}
              aria-disabled="true"
              title={item.disabledReason}
              style={{
                ...baseStyle,
                color: "var(--aptus-text-subtle)",
                cursor: "not-allowed",
                opacity: 0.6,
              }}
            >
              {item.label}
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            style={{
              ...baseStyle,
              background: isActive ? "var(--aptus-surface-2)" : "transparent",
              color: isActive ? "var(--aptus-text)" : "var(--aptus-text-muted)",
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
