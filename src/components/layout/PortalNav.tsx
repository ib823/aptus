"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Settings, LogOut } from "lucide-react";
import { BoundLogo } from "@/components/shared/BoundLogo";
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
      show: user.role === "admin",
    },
  ];

  return (
    <header className="border-b border-gray-200 bg-white">
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
                          ? "bg-blue-50 text-blue-600 font-medium"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-950"
                      }`}
                    >
                      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${isActive ? "text-blue-500" : "text-gray-400"}`} />
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
                          ? "bg-blue-50 text-blue-600"
                          : "text-gray-500 hover:bg-gray-100"
                      }`}
                      aria-label={item.label}
                    >
                      <Icon className="w-4 h-4" />
                    </Link>
                  );
                })}
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <span className="hidden sm:inline text-sm text-gray-600">{user.name}</span>
            <button
              onClick={() => {
                window.location.href = "/api/auth/logout";
              }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
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
