import { prisma } from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

export async function RecentActivityPanel({ assessmentIds }: { assessmentIds: string[] }) {
  const recentActivity = assessmentIds.length > 0
    ? await prisma.decisionLogEntry.findMany({
        where: { assessmentId: { in: assessmentIds } },
        orderBy: { timestamp: "desc" },
        take: 15,
        select: {
          id: true,
          action: true,
          actor: true,
          actorRole: true,
          timestamp: true,
          entityType: true,
          assessment: { select: { companyName: true } },
        },
      })
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                <div>
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{entry.actor}</span>
                    {" "}
                    {entry.action.toLowerCase().replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    {formatDistanceToNow(entry.timestamp, { addSuffix: true })}
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
