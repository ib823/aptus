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

interface ActivityEntryProps {
  actorName: string;
  actorRole: string;
  actionType: string;
  summary: string;
  entityType?: string | null | undefined;
  areaCode?: string | null | undefined;
  createdAt: string;
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

export function ActivityEntry({
  actorName,
  actorRole,
  actionType,
  summary,
  entityType,
  areaCode,
  createdAt,
}: ActivityEntryProps) {
  const Icon = ACTION_ICONS[actionType] ?? Activity;

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
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
          </span>
          {actorRole && (
            <Badge variant="outline" className="text-xs h-5">
              {actorRole}
            </Badge>
          )}
          {entityType && (
            <Badge variant="secondary" className="text-xs h-5">
              {entityType}
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
