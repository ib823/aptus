"use client";

// Use native <a> tags instead of Next.js Link to avoid silent router.push failures
import { usePathname } from "next/navigation";
import {
  Home, Building2, BarChart3, Puzzle, ArrowLeftRight,
  Database, Upload, CheckCircle, Landmark, Users, Shield, List, MessageCircleQuestion,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { href: "/admin", label: "Overview", icon: Home },
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
      { href: "/admin/ingest", label: "ZIP Ingestion", icon: Upload },
      { href: "/admin/verify", label: "Data Verification", icon: CheckCircle },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/organizations", label: "Organizations", icon: Landmark },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/roles", label: "Roles & Permissions", icon: Shield },
      { href: "/admin/assessments", label: "All Assessments", icon: List },
      { href: "/admin/help", label: "Help Queue", icon: MessageCircleQuestion },
    ],
  },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const currentPath = pathname ?? "";

  return (
    <aside
      className="w-64 shrink-0 border-r"
      aria-label="Admin navigation"
      style={{ background: "var(--sapGroup_ContentBackground, #fff)" }}
    >
      <div
        className="p-4 border-b"
        style={{ borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)" }}
      >
        <p
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "var(--sapContent_LabelColor, #6a6d70)" }}
          aria-hidden="true"
        >
          Admin Panel
        </p>
      </div>
      <nav className="py-2">
        {NAV_SECTIONS.map((section, idx) => (
          <div key={idx}>
            {section.label && (
              <p
                className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--sapContent_LabelColor, #6a6d70)" }}
              >
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const isActive =
                item.href === "/admin"
                  ? currentPath === "/admin"
                  : currentPath === item.href || currentPath.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? "font-medium"
                      : "hover:opacity-80"
                  }`}
                  style={{
                    color: isActive
                      ? "var(--sapSelectedColor, #0854a0)"
                      : "var(--sapTextColor, #32363a)",
                    background: isActive
                      ? "var(--sapList_Active_Background, #eaf6ff)"
                      : "transparent",
                    borderLeft: isActive
                      ? "3px solid var(--sapSelectedColor, #0854a0)"
                      : "3px solid transparent",
                  }}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate" title={item.label}>{item.label}</span>
                </a>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
