"use client";

/**
 * AptusTopbar — fixed 56 px top bar (spec §6.1).
 * Source: docs/design/v1.2/components.jsx (the prototype's Topbar).
 *
 * Composition: AptusWordmark (left) → search trigger (center) → theme/notif
 * icons + UserMenu (right). The search trigger is a placeholder that opens
 * the Cmd-K palette in App-7.
 */

import { Bell, Menu, Search } from "lucide-react";
import Link from "next/link";
import { AptusWordmark } from "./AptusMark";
import { AptusUserMenu, type AptusUserMenuUser } from "./AptusUserMenu";

interface AptusTopbarProps {
  user: AptusUserMenuUser;
  /** Click handler for the search trigger — wires to Cmd-K palette in App-7. */
  onSearch?: () => void;
  /** Click handler for the mobile-only hamburger toggle. Hidden ≥769px via the
   * `.a-menu-toggle` rule in globals.css. */
  onMenuToggle?: () => void;
  /** Whether the off-canvas sidebar is currently open (for aria-expanded). */
  menuOpen?: boolean;
}

export function AptusTopbar({ user, onSearch, onMenuToggle, menuOpen }: AptusTopbarProps) {
  return (
    <div className="a-topbar" style={{ display: "flex", alignItems: "center", gap: 16, height: 56, padding: "0 20px", borderBottom: "1px solid var(--aptus-border)", background: "var(--aptus-surface)", position: "sticky", top: 0, zIndex: 10 }}>
      <button
        type="button"
        className="a-menu-toggle"
        aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={menuOpen ?? false}
        onClick={onMenuToggle}
        style={{
          // Display managed by globals.css media query (.a-menu-toggle).
          display: "none",
          width: 32,
          height: 32,
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid transparent",
          borderRadius: 6,
          background: "transparent",
          color: "var(--aptus-text)",
        }}
      >
        <Menu size={18} />
      </button>

      <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
        <AptusWordmark size={15} />
      </Link>

      <button
        onClick={onSearch}
        type="button"
        className="a-search"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 32,
          padding: "0 10px 0 12px",
          border: "1px solid var(--aptus-border)",
          borderRadius: 6,
          background: "var(--aptus-surface-2)",
          color: "var(--aptus-text-muted)",
          fontSize: 13,
          cursor: "pointer",
          minWidth: 0,
          flex: "1 1 auto",
          maxWidth: 480,
          fontFamily: "inherit",
        }}
      >
        <Search size={14} />
        <span>Search assessments, scope items, commands…</span>
        <kbd
          style={{
            fontFamily: "inherit",
            fontSize: 11,
            padding: "1px 5px",
            border: "1px solid var(--aptus-border)",
            borderRadius: 4,
            background: "var(--aptus-surface)",
            marginLeft: "auto",
            color: "var(--aptus-text-muted)",
          }}
        >
          ⌘K
        </kbd>
      </button>

      <div className="a-actions" style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto", marginLeft: "auto" }}>
      <button
        type="button"
        aria-label="Notifications"
        style={{
          width: 32,
          height: 32,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid transparent",
          borderRadius: 6,
          background: "transparent",
          color: "var(--aptus-text)",
          cursor: "pointer",
        }}
      >
        <Bell size={16} />
      </button>

      <AptusUserMenu user={user} />
      </div>
    </div>
  );
}
