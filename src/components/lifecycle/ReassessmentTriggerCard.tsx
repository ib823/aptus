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
  OPEN: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  ACKNOWLEDGED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  RESOLVED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  DISMISSED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
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
