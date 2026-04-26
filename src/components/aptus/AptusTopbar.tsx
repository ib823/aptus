"use client";

/**
 * AptusTopbar — fixed 56 px top bar (spec §6.1).
 * Source: docs/design/v1.2/components.jsx (the prototype's Topbar).
 *
 * Composition: AptusWordmark (left) → search trigger (center) → theme/notif
 * icons + UserMenu (right). The search trigger is a placeholder that opens
 * the Cmd-K palette in App-7.
 */

import { Bell, Search } from "lucide-react";
import Link from "next/link";
import { AptusWordmark } from "./AptusMark";
import { AptusUserMenu, type AptusUserMenuUser } from "./AptusUserMenu";

interface AptusTopbarProps {
  user: AptusUserMenuUser;
  /** Click handler for the search trigger — wires to Cmd-K palette in App-7. */
  onSearch?: () => void;
}

export function AptusTopbar({ user, onSearch }: AptusTopbarProps) {
  return (
    <div className="a-topbar" style={{ display: "flex", alignItems: "center", gap: 16, height: 56, padding: "0 20px", borderBottom: "1px solid var(--aptus-border)", background: "var(--aptus-surface)", position: "sticky", top: 0, zIndex: 10 }}>
      <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none" }}>
        <AptusWordmark size={15} />
      </Link>

      <button
        onClick={onSearch}
        type="button"
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
          minWidth: 280,
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

      <div style={{ flex: 1 }} />

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
  );
}
