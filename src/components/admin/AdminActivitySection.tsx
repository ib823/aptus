import { prisma } from "@/lib/db/prisma";

export async function AdminActivitySection() {
  const recentActivity = await prisma.decisionLogEntry.findMany({
    orderBy: { timestamp: "desc" },
    take: 20,
    select: { id: true, assessmentId: true, entityType: true, action: true, actor: true, actorRole: true, timestamp: true },
  });

  return (
    <div className="bg-card rounded-lg border p-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
        Recent Activity
      </h3>
      {recentActivity.length === 0 ? (
        <p className="text-sm text-muted-foreground/60">No recent activity</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {recentActivity.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-border/50 last:border-0">
              <span className="text-xs text-muted-foreground/60 w-36 shrink-0">
                {entry.timestamp.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="text-muted-foreground truncate">{entry.actor}</span>
              <span className="text-foreground font-medium truncate">{entry.action}</span>
              <span className="text-xs text-muted-foreground/60">{entry.entityType}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActivitySkeleton() {
  return (
    <div className="bg-card rounded-lg border p-6">
      <div className="h-3 bg-muted rounded animate-pulse w-28 mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <div className="h-3 bg-muted rounded animate-pulse w-36" />
            <div className="h-3 bg-muted rounded animate-pulse w-20" />
            <div className="h-3 bg-muted rounded animate-pulse w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
