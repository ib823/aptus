"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Building2, BarChart3, Puzzle, ArrowLeftRight,
  Database, FileArchive, ClipboardCheck, Users, ListChecks,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/admin/industries", label: "Industries", icon: Building2 },
      { href: "/admin/baselines", label: "Effort Baselines", icon: BarChart3 },
      { href: "/admin/extensibility-patterns", label: "Extensibility Patterns", icon: Puzzle },
      { href: "/admin/adaptation-patterns", label: "Adaptation Patterns", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/admin/catalog", label: "SAP Catalog", icon: Database },
      { href: "/admin/ingest", label: "ZIP Ingestion", icon: FileArchive },
      { href: "/admin/verify", label: "Data Verification", icon: ClipboardCheck },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/assessments", label: "All Assessments", icon: ListChecks },
    ],
  },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-gray-950 text-white shrink-0">
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
          Admin Panel
        </h2>
      </div>
      <nav className="p-3 space-y-4">
        {NAV_SECTIONS.map((section, idx) => (
          <div key={idx}>
            {section.label && (
              <p className="px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-white/10 text-white font-medium"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
