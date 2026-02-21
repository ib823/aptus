"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboardIcon,
  ClipboardListIcon,
  BarChart3Icon,
  MoreHorizontalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TOUCH_TARGETS } from "@/types/pwa";

interface Tab {
  href: string;
  label: string;
  icon: typeof LayoutDashboardIcon;
  matchPrefix: string;
}

const tabs: Tab[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon, matchPrefix: "/dashboard" },
  { href: "/assessments", label: "Assessments", icon: ClipboardListIcon, matchPrefix: "/assessments" },
  { href: "/reports", label: "Reports", icon: BarChart3Icon, matchPrefix: "/reports" },
  { href: "/more", label: "More", icon: MoreHorizontalIcon, matchPrefix: "/more" },
];

export function MobileBottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      className="bg-background fixed inset-x-0 bottom-0 z-50 border-t md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around">
        {tabs.map(({ href, label, icon: TabIcon, matchPrefix }) => {
          const isActive = pathname.startsWith(matchPrefix);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-2 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
              style={{
                minWidth: TOUCH_TARGETS.minimum,
                minHeight: TOUCH_TARGETS.minimum,
              }}
              aria-current={isActive ? "page" : undefined}
            >
              <TabIcon className="size-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
