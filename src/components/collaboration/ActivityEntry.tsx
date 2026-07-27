"use client";

import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle,
  AlertTriangle,
  MessageSquare,
  Users,
  FileText,
  ArrowRight,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { UserRole } from "@/types/assessment";

interface ActivityEntryProps {
  actorName: string;
  actorRole: string;
  actionType: string;
  summary: string;
  entityType?: string | null | undefined;
  areaCode?: string | null | undefined;
  createdAt: string;
  hideTimestamp?: boolean | undefined;
}

const ACTION_ICONS: Record<string, typeof Activity> = {
  classified_steps: CheckCircle,
  added_gap: AlertTriangle,
  resolved_gap: CheckCircle,
  commented: MessageSquare,
  mentioned: MessageSquare,
  conflict_detected: AlertTriangle,
  conflict_resolved: CheckCircle,
  workshop_completed: Users,
  scope_changed: FileText,
  sign_off_submitted: CheckCircle,
  status_changed: ArrowRight,
  phase_updated: ArrowRight,
};

/**
 * Map role slugs to the short labels this feed uses.
 *
 * `Record<UserRole, …>` so the next role added to the union fails the compiler
 * here rather than falling through to `humanizeLabel`'s slug-prettifier. That
 * fallback is decent — it rendered `support` as "Support" — but it is a
 * coincidence, not a decision, and it produces "It Lead" for `it_lead`.
 *
 * The legacy `admin` entry is gone: `humanizeLabel` renders that slug as "Admin"
 * unaided, which is what the entry said.
 */
const ROLE_LABELS: Record<UserRole, string> = {
  platform_admin: "Admin",
  partner_lead: "Partner Lead",
  consultant: "Consultant",
  project_manager: "Project Manager",
  solution_architect: "Solution Architect",
  process_owner: "Process Owner",
  it_lead: "IT Lead",
  data_migration_lead: "Data Migration Lead",
  executive_sponsor: "Executive Sponsor",
  viewer: "Viewer",
  client_admin: "Client Admin",
  support: "Support",
};

/** Map raw entity types to human-readable labels */
const ENTITY_LABELS: Record<string, string> = {
  process_step: "Process Step",
  scope_item: "Scope Item",
  gap_resolution: "Gap Resolution",
  config_activity: "Config Activity",
  integration: "Integration",
  data_migration: "Data Migration",
  ocm_impact: "Change Impact",
  workshop: "Workshop",
  assessment: "Assessment",
};

function humanizeLabel(value: string, labelMap: Record<string, string>): string {
  return labelMap[value] ?? value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ActivityEntry({
  actorName,
  actorRole,
  actionType,
  summary,
  entityType,
  areaCode,
  createdAt,
  hideTimestamp,
}: ActivityEntryProps) {
  const Icon = ACTION_ICONS[actionType] ?? Activity;
  const displayRole = humanizeLabel(actorRole, ROLE_LABELS);
  const displayEntity = entityType ? humanizeLabel(entityType, ENTITY_LABELS) : null;

  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 text-muted-foreground">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium">{actorName}</span>{" "}
          <span className="text-muted-foreground">{summary}</span>
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {!hideTimestamp && (
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
            </span>
          )}
          {actorRole && (
            <Badge variant="outline" className="text-xs h-5">
              {displayRole}
            </Badge>
          )}
          {displayEntity && (
            <Badge variant="secondary" className="text-xs h-5">
              {displayEntity}
            </Badge>
          )}
          {areaCode && (
            <Badge variant="secondary" className="text-xs h-5">
              {areaCode}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
