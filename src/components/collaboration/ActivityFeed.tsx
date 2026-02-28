"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ActivityEntry } from "@/components/collaboration/ActivityEntry";

function getEntryDotColor(actionType: string): string {
  switch (actionType) {
    case "classified_steps": return "bg-blue-500";
    case "added_gap":
    case "resolved_gap": return "bg-amber-500";
    case "scope_changed":
    case "sign_off_submitted":
    case "workshop_completed": return "bg-green-500";
    case "conflict_detected":
    case "conflict_resolved": return "bg-orange-500";
    default: return "bg-slate-400";
  }
}

interface ActivityData {
  id: string;
  actorName: string;
  actorRole: string;
  actionType: string;
  summary: string;
  entityType: string | null;
  entityId: string | null;
  areaCode: string | null;
  createdAt: string;
}

interface ActivityFeedProps {
  assessmentId: string;
}

const ACTION_FILTER_OPTIONS = [
  { value: "all", label: "All activity" },
  { value: "classified_steps", label: "Step classifications" },
  { value: "added_gap", label: "Gaps added" },
  { value: "resolved_gap", label: "Gaps resolved" },
  { value: "commented", label: "Comments" },
  { value: "conflict_detected", label: "Conflicts" },
  { value: "status_changed", label: "Status changes" },
  { value: "phase_updated", label: "Phase updates" },
];

export function ActivityFeed({ assessmentId }: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchEntries = useCallback(
    async (cursor?: string | undefined) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "30");
        if (actionFilter !== "all") params.set("actionType", actionFilter);
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(
          `/api/assessments/${assessmentId}/activity?${params.toString()}`,
        );
        if (res.ok) {
          const json = await res.json();
          if (cursor) {
            setEntries((prev) => [...prev, ...(json.data ?? [])]);
          } else {
            setEntries(json.data ?? []);
          }
          setNextCursor(json.nextCursor ?? null);
          setHasMore(json.hasMore ?? false);
        }
      } finally {
        setLoading(false);
      }
    },
    [assessmentId, actionFilter],
  );

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold text-sm">Activity</h3>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="flex-1">
        {loading && entries.length === 0 ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-4 h-4 rounded-full bg-muted animate-pulse mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </div>
        ) : (
          <div className="space-y-0 px-3">
            {entries.map((entry, i) => {
              const ts = new Date(entry.createdAt);
              return (
                <div key={entry.id} className="flex gap-4 py-3 border-b border-border last:border-0">
                  {/* Timestamp column */}
                  <div className="w-16 flex-shrink-0 text-right">
                    <div className="text-xs font-medium text-muted-foreground">
                      {format(ts, "MMM d")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(ts, "HH:mm")}
                    </div>
                  </div>

                  {/* Timeline dot + connector */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full mt-1.5 ${getEntryDotColor(entry.actionType)}`} />
                    {i < entries.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <ActivityEntry
                      actorName={entry.actorName}
                      actorRole={entry.actorRole}
                      actionType={entry.actionType}
                      summary={entry.summary}
                      entityType={entry.entityType}
                      areaCode={entry.areaCode}
                      createdAt={entry.createdAt}
                      hideTimestamp
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div className="p-3 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (nextCursor) fetchEntries(nextCursor);
              }}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load more"}
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
