"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShellBar,
  Avatar,
} from "@ui5/webcomponents-react";
import { LogOut, User, Settings, ChevronDown } from "lucide-react";
import "@ui5/webcomponents-icons/dist/home.js";
import "@ui5/webcomponents-icons/dist/document.js";
import "@ui5/webcomponents-icons/dist/action-settings.js";
import "@ui5/webcomponents-icons/dist/chart-table-view.js";
import "@ui5/webcomponents-icons/dist/building.js";
import { ABeamLogo } from "@/components/shared/ABeamLogo";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { UI_TEXT } from "@/constants/ui-text";
import type { SessionUser } from "@/types/assessment";

interface PortalNavProps {
  user: SessionUser;
}

export function PortalNav({ user }: PortalNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmLogout(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Close menu on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setConfirmLogout(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [menuOpen]);

  const navItems = [
    {
      label: UI_TEXT.nav.dashboard,
      href: "/dashboard",
      show: true,
    },
    {
      label: UI_TEXT.nav.assessments,
      href: "/assessments",
      show: true,
    },
    {
      label: UI_TEXT.nav.analytics,
      href: "/analytics",
      show: true,
    },
    {
      label: UI_TEXT.nav.organization,
      href: "/organization",
      show: true,
    },
    {
      label: UI_TEXT.nav.admin,
      href: "/admin",
      show: ["platform_admin", "admin"].includes(user.role),
    },
  ];

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSignOut = () => {
    if (!confirmLogout) {
      setConfirmLogout(true);
      return;
    }
    window.location.href = "/api/auth/logout";
  };

  return (
    <header className="border-b" style={{ background: "var(--sapShellColor, #354a5f)" }}>
      <ShellBar
        primaryTitle="ABeam"
        showNotifications={false}
        logo={
          <Link href="/assessments" className="flex items-center" slot="logo">
            <ABeamLogo size="sm" />
          </Link>
        }
        profile={
          <Avatar
            slot="profile"
            initials={getInitials(user.name ?? "U")}
            size="XS"
            colorScheme="Accent6"
          />
        }
        onLogoClick={() => {
          router.push("/assessments");
        }}
        onProfileClick={() => {
          setMenuOpen((prev) => !prev);
        }}
        className="[&]:max-w-7xl [&]:mx-auto"
      />
      {/* Secondary navigation row for page links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" style={{ background: "var(--sapShell_Navigation_Background, #fff)" }}>
        <div className="flex h-12 items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
              {navItems
                .filter((item) => item.show)
                .map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex items-center gap-2 h-9 px-3 rounded-md text-sm transition-all duration-200 ${
                        isActive
                          ? "font-medium"
                          : "hover:opacity-80"
                      }`}
                      style={{
                        color: isActive
                          ? "var(--sapShell_Navigation_SelectedColor, #0854a0)"
                          : "var(--sapShell_Navigation_TextColor, #515456)",
                        background: isActive
                          ? "var(--sapShell_Navigation_Selected_Background, #eaf6ff)"
                          : "transparent",
                        borderBottom: isActive
                          ? "2px solid var(--sapShell_Navigation_SelectedColor, #0854a0)"
                          : "2px solid transparent",
                      }}
                    >
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
            </nav>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 shrink-0 relative" ref={menuRef}>
            <NotificationBell />
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-80"
              style={{ color: "var(--sapContent_LabelColor, #6a6d70)" }}
              aria-label="User menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <span className="hidden sm:inline">{user.name}</span>
              <ChevronDown className="size-4" />
            </button>
            {/* User dropdown menu */}
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 w-56 rounded-lg border shadow-lg py-1 z-50"
                style={{
                  background: "var(--sapGroup_ContentBackground, #fff)",
                  borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)",
                }}
              >
                <div className="px-3 py-2 border-b" style={{ borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--sapTextColor, #32363a)" }}>{user.name}</p>
                  <p className="text-xs" style={{ color: "var(--sapContent_LabelColor, #6a6d70)" }}>{user.email ?? user.role}</p>
                </div>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); router.push("/organization"); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:opacity-80 transition-colors"
                  style={{ color: "var(--sapTextColor, #32363a)" }}
                >
                  <User className="size-4" />
                  Profile
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); router.push("/organization"); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:opacity-80 transition-colors"
                  style={{ color: "var(--sapTextColor, #32363a)" }}
                >
                  <Settings className="size-4" />
                  Settings
                </button>
                <div className="border-t my-1" style={{ borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)" }} />
                <button
                  role="menuitem"
                  onClick={handleSignOut}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:opacity-80 transition-colors"
                  style={{ color: confirmLogout ? "var(--sapNegativeColor, #b00)" : "var(--sapTextColor, #32363a)" }}
                >
                  <LogOut className="size-4" />
                  {confirmLogout ? "Click again to confirm" : UI_TEXT.auth.signOut}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
