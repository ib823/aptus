"use client";

/**
 * AptusUserMenu — top-right avatar with click-out dropdown.
 * Source: docs/design/v1.2/components.jsx (UserMenuButton).
 *
 * Click-out: closes the dropdown when the user clicks anywhere outside it.
 */

import { ChevronDown, FileText, HelpCircle, LogOut, Settings as SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { clearClientSessionCaches } from "@/lib/pwa/client-cache";

export interface AptusUserMenuUser {
  name: string;
  email: string;
  initials: string;
}

interface AptusUserMenuProps {
  user: AptusUserMenuUser;
}

export function AptusUserMenu({ user }: AptusUserMenuProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await clearClientSessionCaches();
    } catch (err) {
      console.warn("[client-cache] Failed to clear client session caches", err);
    } finally {
      window.location.assign("/api/auth/logout");
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 4,
          borderRadius: 999,
          border: "1px solid var(--aptus-border)",
          background: "var(--aptus-surface)",
          cursor: "pointer",
        }}
      >
        <div className="a-avatar" style={{ width: 28, height: 28, borderRadius: 999, background: "linear-gradient(135deg, #6366F1, #8B5CF6)", color: "white", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>
          {user.initials}
        </div>
        <ChevronDown size={14} style={{ color: "var(--aptus-text-muted)", marginRight: 4 }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            background: "var(--aptus-surface)",
            border: "1px solid var(--aptus-border)",
            borderRadius: 8,
            boxShadow: "var(--aptus-shadow-md)",
            minWidth: 220,
            padding: 6,
            zIndex: 30,
          }}
        >
          <div style={{ padding: "8px 10px 12px" }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{user.name}</div>
            <div className="a-small">{user.email}</div>
          </div>
          <div className="a-divider" style={{ margin: "4px 0" }} />
          <MenuItem href="/settings/profile" icon={<SettingsIcon size={14} />} label="Profile" />
          <MenuItem href="/settings" icon={<SettingsIcon size={14} />} label="Settings" />
          <div className="a-divider" style={{ margin: "4px 0" }} />
          <MenuItem href="/help" icon={<HelpCircle size={14} />} label="Help & docs" />
          <MenuItem icon={<FileText size={14} />} label="Keyboard shortcuts" trailing="?" />
          <div className="a-divider" style={{ margin: "4px 0" }} />
          <MenuItem icon={<LogOut size={14} />} label={signingOut ? "Signing out" : "Sign out"} onClick={handleSignOut} />
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  trailing?: string;
}

function MenuItem({ icon, label, href, onClick, trailing }: MenuItemProps) {
  const inner = (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 13,
        color: "var(--aptus-text)",
        textDecoration: "none",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--aptus-surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ color: "var(--aptus-text-muted)" }}>{icon}</span>
      {label}
      {trailing && (
        <kbd
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: "var(--aptus-text-muted)",
            padding: "1px 5px",
            border: "1px solid var(--aptus-border)",
            borderRadius: 4,
          }}
        >
          {trailing}
        </kbd>
      )}
    </span>
  );

  if (href) {
    return <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link>;
  }
  return (
    <button type="button" onClick={onClick} style={{ background: "transparent", border: "none", padding: 0, width: "100%", textAlign: "left", fontFamily: "inherit", cursor: "pointer" }}>
      {inner}
    </button>
  );
}
