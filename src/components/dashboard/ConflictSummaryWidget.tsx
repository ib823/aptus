"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

interface ConflictData {
  id: string;
  entityType: string;
  entityId: string;
  status: string;
  createdAt: string;
}

interface ConflictSummaryWidgetProps {
  conflicts: ConflictData[];
}

export function ConflictSummaryWidget({ conflicts }: ConflictSummaryWidgetProps) {
  const openConflicts = conflicts.filter((c) => c.status === "OPEN");
  const resolvedConflicts = conflicts.filter((c) => c.status !== "OPEN");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Classification Conflicts</CardTitle>
          {openConflicts.length > 0 && (
            <Badge className="bg-amber-100 text-amber-700 text-xs">
              {openConflicts.length} open
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {conflicts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No conflicts detected.</p>
        ) : (
          <>
            <div className="flex gap-4 mb-4">
              <div className="text-center">
                <span className="text-2xl font-bold text-amber-600">{openConflicts.length}</span>
                <p className="text-xs text-muted-foreground">Open</p>
              </div>
              <div className="text-center">
                <span className="text-2xl font-bold text-green-600">{resolvedConflicts.length}</span>
                <p className="text-xs text-muted-foreground">Resolved</p>
              </div>
            </div>
            {openConflicts.length > 0 && (
              <div className="space-y-2">
                {openConflicts.slice(0, 5).map((conflict) => (
                  <div
                    key={conflict.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-amber-50 border border-amber-100"
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="text-sm truncate">
                      {conflict.entityType} {conflict.entityId}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
