"use client";

import type { UserRole } from "@/types/assessment";
import { ROLE_LABELS } from "@/types/assessment";
import { mapLegacyRole } from "@/lib/auth/role-migration";

const ROLE_COLORS: Record<UserRole, string> = {
  platform_admin: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  partner_lead: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  consultant: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  project_manager: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  solution_architect: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  process_owner: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  it_lead: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  data_migration_lead: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  executive_sponsor: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  viewer: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  client_admin: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
};

interface RoleBadgeProps {
  role: string;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const mapped = mapLegacyRole(role);
  const label = ROLE_LABELS[mapped] ?? role;
  const colorClass = ROLE_COLORS[mapped] ?? "bg-muted text-muted-foreground";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}
