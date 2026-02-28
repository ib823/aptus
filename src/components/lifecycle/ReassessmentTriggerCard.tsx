"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TriggerTypeBadge } from "./TriggerTypeBadge";
import { cn } from "@/lib/utils";

interface ReassessmentTriggerCardProps {
  title: string;
  triggerType: string;
  description: string;
  status: string;
  sourceReference?: string | undefined;
  detectedAt: string;
  resolution?: string | undefined;
  onAcknowledge?: (() => void) | undefined;
  onDismiss?: (() => void) | undefined;
  onResolve?: (() => void) | undefined;
  className?: string | undefined;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-yellow-50 text-yellow-700",
  ACKNOWLEDGED: "bg-blue-50 text-blue-700",
  IN_PROGRESS: "bg-indigo-50 text-indigo-700",
  RESOLVED: "bg-green-50 text-green-700",
  DISMISSED: "bg-slate-50 text-slate-700",
};

export function ReassessmentTriggerCard({
  title,
  triggerType,
  description,
  status,
  sourceReference,
  detectedAt,
  resolution,
  onAcknowledge,
  onDismiss,
  onResolve,
  className,
}: ReassessmentTriggerCardProps) {
  const isActionable = status === "OPEN" || status === "ACKNOWLEDGED" || status === "IN_PROGRESS";

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex gap-2">
            <TriggerTypeBadge triggerType={triggerType} />
            <Badge variant="outline" className={cn("border-transparent", STATUS_STYLES[status] ?? "")}>
              {status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{description}</p>
        {sourceReference ? (
          <p className="text-xs text-muted-foreground">
            Source: {sourceReference}
          </p>
        ) : null}
        {resolution ? (
          <p className="text-sm">
            <span className="font-medium">Resolution:</span> {resolution}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Detected: {new Date(detectedAt).toLocaleDateString()}
        </p>
        {isActionable ? (
          <div className="flex gap-2 pt-2">
            {status === "OPEN" && onAcknowledge ? (
              <Button size="sm" variant="outline" onClick={onAcknowledge}>
                Acknowledge
              </Button>
            ) : null}
            {onResolve ? (
              <Button size="sm" onClick={onResolve}>
                Resolve
              </Button>
            ) : null}
            {onDismiss ? (
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                Dismiss
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
