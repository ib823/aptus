"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangeRequestStatusBadge } from "./ChangeRequestStatusBadge";
import { cn } from "@/lib/utils";

interface ChangeRequestCardProps {
  title: string;
  status: string;
  requestedBy?: string | undefined;
  reason: string;
  affectedCount: number;
  riskLevel?: string | undefined;
  createdAt: string;
  className?: string | undefined;
}

export function ChangeRequestCard({
  title,
  status,
  requestedBy,
  reason,
  affectedCount,
  riskLevel,
  createdAt,
  className,
}: ChangeRequestCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <ChangeRequestStatusBadge status={status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{reason}</p>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {requestedBy ? <span>Requested by: {requestedBy}</span> : null}
          <span>Affected entities: {affectedCount}</span>
          {riskLevel ? (
            <span
              className={cn(
                "font-medium",
                riskLevel === "critical" && "text-red-600",
                riskLevel === "high" && "text-orange-600",
                riskLevel === "medium" && "text-yellow-600",
                riskLevel === "low" && "text-green-600",
              )}
            >
              Risk: {riskLevel}
            </span>
          ) : null}
          <span>Created: {new Date(createdAt).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
