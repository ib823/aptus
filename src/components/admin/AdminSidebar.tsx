"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  SideNavigation,
  SideNavigationItem,
  SideNavigationGroup,
} from "@ui5/webcomponents-react";
import "@ui5/webcomponents-icons/dist/home.js";
import "@ui5/webcomponents-icons/dist/building.js";
import "@ui5/webcomponents-icons/dist/bar-chart.js";
import "@ui5/webcomponents-icons/dist/puzzle.js";
import "@ui5/webcomponents-icons/dist/switch-views.js";
import "@ui5/webcomponents-icons/dist/database.js";
import "@ui5/webcomponents-icons/dist/upload-to-cloud.js";
import "@ui5/webcomponents-icons/dist/accept.js";
import "@ui5/webcomponents-icons/dist/official-service.js";
import "@ui5/webcomponents-icons/dist/group.js";
import "@ui5/webcomponents-icons/dist/shield.js";
import "@ui5/webcomponents-icons/dist/list.js";

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { href: "/admin", label: "Overview", icon: "sap-icon://home" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/admin/industries", label: "Industries", icon: "sap-icon://building" },
      { href: "/admin/baselines", label: "Effort Baselines", icon: "sap-icon://bar-chart" },
      { href: "/admin/extensibility-patterns", label: "Extensibility Patterns", icon: "sap-icon://puzzle" },
      { href: "/admin/adaptation-patterns", label: "Adaptation Patterns", icon: "sap-icon://switch-views" },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/admin/catalog", label: "SAP Catalog", icon: "sap-icon://database" },
      { href: "/admin/ingest", label: "ZIP Ingestion", icon: "sap-icon://upload-to-cloud" },
      { href: "/admin/verify", label: "Data Verification", icon: "sap-icon://accept" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/organizations", label: "Organizations", icon: "sap-icon://official-service" },
      { href: "/admin/users", label: "Users", icon: "sap-icon://group" },
      { href: "/admin/roles", label: "Roles & Permissions", icon: "sap-icon://shield" },
      { href: "/admin/assessments", label: "All Assessments", icon: "sap-icon://list" },
    ],
  },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <aside className="w-64 shrink-0 border-r" aria-label="Admin navigation" style={{ background: "var(--sapGroup_ContentBackground, #fff)" }}>
      <div className="p-4 border-b" style={{ borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)" }}>
        <p
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "var(--sapContent_LabelColor, #6a6d70)" }}
          aria-hidden="true"
        >
          Admin Panel
        </p>
      </div>
      <SideNavigation
        onSelectionChange={(e: unknown) => {
          const event = e as { detail?: { item?: HTMLElement } };
          const item = event.detail?.item;
          const href = item?.dataset?.href;
          if (href) {
            router.push(href);
          }
        }}
      >
        {NAV_SECTIONS.map((section, idx) => {
          if (!section.label) {
            // Ungrouped items
            return section.items.map((item) => (
              <SideNavigationItem
                key={item.href}
                text={item.label}
                icon={item.icon}
                selected={pathname === item.href}
                data-href={item.href}
              />
            ));
          }
          return (
            <SideNavigationGroup
              key={idx}
              text={section.label}
              expanded
            >
              {section.items.map((item) => (
                <SideNavigationItem
                  key={item.href}
                  text={item.label}
                  icon={item.icon}
                  selected={pathname === item.href}
                  data-href={item.href}
                />
              ))}
            </SideNavigationGroup>
          );
        })}
      </SideNavigation>
    </aside>
  );
}
