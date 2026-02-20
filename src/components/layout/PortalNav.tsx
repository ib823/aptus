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
      href: "/intelligence/industries",
      icon: Settings,
      show: user.role === "admin",
    },
  ];

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/assessments" className="flex items-center">
              <BoundLogo size="sm" />
            </Link>
            <nav className="flex items-center gap-1" aria-label="Main navigation">
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
                      className={`flex items-center gap-2 h-10 px-3 rounded-md text-base transition-all duration-200 ${
                        isActive
                          ? "bg-blue-50 text-blue-600 font-medium"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-950"
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? "text-blue-500" : "text-gray-400"}`} />
                      {item.label}
                    </Link>
                  );
                })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user.name}</span>
            <button
              onClick={() => {
                window.location.href = "/api/auth/signout";
              }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              aria-label={UI_TEXT.auth.signOut}
            >
              <LogOut className="w-4 h-4" />
              {UI_TEXT.auth.signOut}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
