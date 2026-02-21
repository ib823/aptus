"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import type { DeadlineStatus } from "@/types/dashboard";

interface Deadline {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  status: DeadlineStatus;
  assignedRole?: string | null;
}

interface DeadlineTimelineProps {
  deadlines: Deadline[];
}

const STATUS_CONFIG: Record<
  DeadlineStatus,
  { icon: typeof Clock; badgeClass: string; label: string }
> = {
  pending: { icon: Clock, badgeClass: "bg-blue-100 text-blue-700", label: "Pending" },
  at_risk: { icon: AlertTriangle, badgeClass: "bg-amber-100 text-amber-700", label: "At Risk" },
  overdue: { icon: AlertTriangle, badgeClass: "bg-red-100 text-red-700", label: "Overdue" },
  completed: { icon: CheckCircle2, badgeClass: "bg-green-100 text-green-700", label: "Done" },
};

export function DeadlineTimeline({ deadlines }: DeadlineTimelineProps) {
  const sorted = [...deadlines].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Deadlines</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deadlines set.</p>
        ) : (
          <div className="relative">
            <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-4">
              {sorted.map((deadline) => {
                const config = STATUS_CONFIG[deadline.status] ?? STATUS_CONFIG.pending;
                const Icon = config.icon;
                const dueDate = new Date(deadline.dueDate);
                return (
                  <div key={deadline.id} className="flex items-start gap-3 relative pl-7">
                    <div className="absolute left-1.5 top-1 w-3 h-3 rounded-full bg-card border-2 border-border" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{deadline.title}</span>
                        <Badge className={`text-xs ${config.badgeClass}`}>
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Due: {dueDate.toLocaleDateString()}
                        {deadline.assignedRole ? ` · ${deadline.assignedRole}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
