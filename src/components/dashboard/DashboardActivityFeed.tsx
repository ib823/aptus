"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

interface ActivityEntry {
  id: string;
  actorName: string;
  actorRole: string;
  actionType: string;
  summary: string;
  createdAt: string;
}

interface GroupedEntry {
  key: string;
  actorName: string;
  summary: string;
  count: number;
  latestId: string;
  latestCreatedAt: string;
}

interface DashboardActivityFeedProps {
  entries: ActivityEntry[];
}

function groupConsecutiveEntries(entries: ActivityEntry[]): GroupedEntry[] {
  const groups: GroupedEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.actorName}::${entry.actionType}::${entry.summary}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.count += 1;
      last.latestCreatedAt = entry.createdAt;
    } else {
      groups.push({
        key,
        actorName: entry.actorName,
        summary: entry.summary,
        count: 1,
        latestId: entry.id,
        latestCreatedAt: entry.createdAt,
      });
    }
  }
  return groups;
}

export function DashboardActivityFeed({ entries }: DashboardActivityFeedProps) {
  const grouped = useMemo(() => groupConsecutiveEntries(entries), [entries]);

  return (
    <Card>
      <CardHeader className="pb-3 border-b" style={{ borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)" }}>
        <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <div className="space-y-3">
            {grouped.map((group) => (
              <div key={group.latestId} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ backgroundColor: "var(--sapBrandColor, #0070f2)" }} />
                <div>
                  <p className="text-sm">
                    <span className="font-medium">{group.actorName}</span>{" "}
                    {group.summary}
                    {group.count > 1 && (
                      <span className="text-muted-foreground"> ({group.count}&times;)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(group.latestCreatedAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
