"use client";

import type { UserRole } from "@/types/assessment";
import { ROLE_LABELS } from "@/types/assessment";
import { mapLegacyRole } from "@/lib/auth/role-migration";

const ROLE_COLORS: Record<UserRole, string> = {
  platform_admin: "bg-purple-50 text-purple-700",
  partner_lead: "bg-indigo-50 text-indigo-700",
  consultant: "bg-blue-50 text-blue-700",
  project_manager: "bg-cyan-50 text-cyan-700",
  solution_architect: "bg-teal-50 text-teal-700",
  process_owner: "bg-green-50 text-green-700",
  it_lead: "bg-amber-50 text-amber-700",
  data_migration_lead: "bg-orange-50 text-orange-700",
  executive_sponsor: "bg-rose-50 text-rose-700",
  viewer: "bg-slate-50 text-slate-700",
  client_admin: "bg-pink-50 text-pink-700",
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
