"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShellBar,
  Avatar,
} from "@ui5/webcomponents-react";
import "@ui5/webcomponents-icons/dist/home.js";
import "@ui5/webcomponents-icons/dist/document.js";
import "@ui5/webcomponents-icons/dist/action-settings.js";
import "@ui5/webcomponents-icons/dist/log.js";
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

  const navItems = [
    {
      label: UI_TEXT.nav.dashboard,
      href: "/dashboard",
      icon: "home",
      show: true,
    },
    {
      label: UI_TEXT.nav.assessments,
      href: "/assessments",
      icon: "document",
      show: true,
    },
    {
      label: UI_TEXT.nav.admin,
      href: "/admin",
      icon: "action-settings",
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
          window.location.href = "/api/auth/logout";
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
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            <span
              className="hidden sm:inline text-sm"
              style={{ color: "var(--sapContent_LabelColor, #6a6d70)" }}
            >
              {user.name}
            </span>
            <NotificationBell />
            <button
              onClick={() => {
                window.location.href = "/api/auth/logout";
              }}
              className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-80"
              style={{ color: "var(--sapContent_LabelColor, #6a6d70)" }}
              aria-label={UI_TEXT.auth.signOut}
            >
              <span className="hidden sm:inline">{UI_TEXT.auth.signOut}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
