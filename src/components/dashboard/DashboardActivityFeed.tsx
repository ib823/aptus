"use client";

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

interface DashboardActivityFeedProps {
  entries: ActivityEntry[];
}

export function DashboardActivityFeed({ entries }: DashboardActivityFeedProps) {
  return (
    <Card>
      <CardHeader className="pb-3 border-b" style={{ borderColor: "var(--sapGroup_ContentBorderColor, #d9d9d9)" }}>
        <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ backgroundColor: "var(--sapBrandColor, #0070f2)" }} />
                <div>
                  <p className="text-sm">
                    <span className="font-medium">{entry.actorName}</span>{" "}
                    {entry.summary}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
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
