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
import { ActivityEntry } from "@/components/collaboration/ActivityEntry";

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
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading activity...
          </div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </div>
        ) : (
          <div className="divide-y px-3">
            {entries.map((entry) => (
              <ActivityEntry
                key={entry.id}
                actorName={entry.actorName}
                actorRole={entry.actorRole}
                actionType={entry.actionType}
                summary={entry.summary}
                entityType={entry.entityType}
                areaCode={entry.areaCode}
                createdAt={entry.createdAt}
              />
            ))}
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
