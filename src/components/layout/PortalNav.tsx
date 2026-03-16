"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, User, Settings, ChevronDown, Menu } from "lucide-react";
import { ABeamLogo } from "@/components/shared/ABeamLogo";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { CommandMenu } from "@/components/shared/CommandMenu";
import { TourReplayMenu } from "@/components/tour/TourReplayMenu";
import { UI_TEXT } from "@/constants/ui-text";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/types/assessment";

interface PortalNavProps {
  user: SessionUser;
}

export function PortalNav({ user }: PortalNavProps) {
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    <header
      className="border-b"
      style={{ background: "var(--sapShell_Background, #fff)" }}
    >
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-12 items-center gap-4">
          {/* Logo */}
          <Link
            href="/assessments"
            className="flex items-center gap-2 shrink-0"
            aria-label="ABeam home"
          >
            <ABeamLogo size="sm" />
            <span
              className="hidden lg:inline text-sm font-semibold"
              style={{ color: "var(--sapShell_TextColor, #32363a)" }}
            >
              ABeam
            </span>
          </Link>

          {/* Mobile Menu Trigger */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="sm:hidden -ml-2 h-10 w-10"
                aria-label="Open navigation menu"
              >
                <Menu className="size-5" style={{ color: "var(--sapShell_TextColor, #32363a)" }} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
              <SheetHeader className="p-4 border-b text-left">
                <SheetTitle className="flex items-center gap-2">
                  <ABeamLogo size="sm" />
                  <span className="text-sm font-semibold">ABeam</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="flex-1 py-2 overflow-y-auto">
                {navItems
                  .filter((item) => item.show)
                  .map((item) => {
                    const isActive =
                      currentPath === item.href ||
                      currentPath.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center px-4 py-3 text-sm transition-colors ${
                          isActive 
                            ? "font-medium bg-blue-50/50" 
                            : "hover:bg-muted"
                        }`}
                        style={{
                          color: isActive
                            ? "var(--sapShell_Navigation_SelectedColor, #0854a0)"
                            : "var(--sapShell_Navigation_TextColor, #515456)",
                          borderLeft: isActive 
                            ? "3px solid var(--sapShell_Navigation_SelectedColor, #0854a0)" 
                            : "3px solid transparent",
                        }}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
              </nav>
              <div className="p-4 border-t mt-auto">
                <p className="text-xs text-muted-foreground mb-1">Signed in as</p>
                <p className="text-sm font-medium truncate">{user.name}</p>
              </div>
            </SheetContent>
          </Sheet>

          {/* Nav Links — scrollable when overflowing */}
          <nav
            className="hidden sm:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-none"
            aria-label="Main navigation"
          >
            {navItems
              .filter((item) => item.show)
              .map((item) => {
                const isActive =
                  currentPath === item.href ||
                  currentPath.startsWith(item.href + "/");
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center h-12 px-3 text-sm whitespace-nowrap shrink-0 transition-all duration-200 ${
                      isActive ? "font-medium" : "hover:opacity-80"
                    }`}
                    style={{
                      color: isActive
                        ? "var(--sapShell_Navigation_SelectedColor, #0854a0)"
                        : "var(--sapShell_Navigation_TextColor, #515456)",
                      boxShadow: isActive
                        ? "inset 0 -2px 0 var(--sapShell_Navigation_SelectedColor, #0854a0)"
                        : "none",
                    }}
                  >
                    {item.label}
                  </a>
                );
              })}
          </nav>

          {/* Right: Notification + User Menu */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 relative ml-auto" ref={menuRef}>
            <CommandMenu />
            <TourReplayMenu />
            <NotificationBell />
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 text-sm transition-colors hover:opacity-80 h-8 px-2 rounded-md"
              style={{ color: "var(--sapContent_LabelColor, #6a6d70)" }}
              aria-label="User menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <span
                className="flex items-center justify-center size-7 rounded-full text-xs font-medium shrink-0"
                style={{
                  background: "var(--sapAccentColor6, #286eb4)",
                  color: "#fff",
                }}
              >
                {getInitials(user.name ?? "U")}
              </span>
              <span className="hidden sm:inline">{user.name}</span>
              <ChevronDown className="size-3.5" />
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
                <div
                  className="px-3 py-2 border-b"
                  style={{ borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)" }}
                >
                  <p className="text-sm font-medium" style={{ color: "var(--sapTextColor, #32363a)" }}>
                    {user.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--sapContent_LabelColor, #6a6d70)" }}>
                    {user.email ?? user.role}
                  </p>
                </div>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); router.push("/settings/profile"); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:opacity-80 transition-colors"
                  style={{ color: "var(--sapTextColor, #32363a)" }}
                >
                  <User className="size-4" />
                  Profile
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); router.push("/settings"); }}
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
