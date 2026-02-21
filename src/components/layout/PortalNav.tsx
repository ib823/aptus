"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Settings, LogOut } from "lucide-react";
import { BoundLogo } from "@/components/shared/BoundLogo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { UI_TEXT } from "@/constants/ui-text";
import type { SessionUser } from "@/types/assessment";

interface PortalNavProps {
  user: SessionUser;
}

export function PortalNav({ user }: PortalNavProps) {
  const pathname = usePathname();

  const navItems = [
    {
      label: UI_TEXT.nav.assessments,
      href: "/assessments",
      icon: FileText,
      show: true,
    },
    {
      label: UI_TEXT.nav.dashboard,
      href: "/dashboard",
      icon: LayoutDashboard,
      show: true,
    },
    {
      label: UI_TEXT.nav.admin,
      href: "/admin",
      icon: Settings,
      show: ["platform_admin", "admin"].includes(user.role),
    },
  ];

  return (
    <header className="border-b bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-8 min-w-0">
            <Link href="/assessments" className="flex items-center shrink-0">
              <BoundLogo size="sm" />
            </Link>
            <nav className="hidden sm:flex items-center gap-1" aria-label="Main navigation">
              {navItems
                .filter((item) => item.show)
                .map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-2 h-10 px-3 rounded-md text-sm sm:text-base transition-all duration-200 ${
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="hidden md:inline">{item.label}</span>
                    </Link>
                  );
                })}
            </nav>
            {/* Mobile nav icons */}
            <nav className="flex sm:hidden items-center gap-1" aria-label="Mobile navigation">
              {navItems
                .filter((item) => item.show)
                .map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center justify-center h-9 w-9 rounded-md transition-all ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                      aria-label={item.label}
                    >
                      <Icon className="w-4 h-4" />
                    </Link>
                  );
                })}
            </nav>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            <span className="hidden sm:inline text-sm text-muted-foreground">{user.name}</span>
            <ThemeToggle />
            <button
              onClick={() => {
                window.location.href = "/api/auth/logout";
              }}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              aria-label={UI_TEXT.auth.signOut}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{UI_TEXT.auth.signOut}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
