"use client";

import { Progress } from "@/components/ui/progress";

interface ConversationProgressProps {
  answeredCount: number;
  estimatedTotal: number;
}

export function ConversationProgress({
  answeredCount,
  estimatedTotal,
}: ConversationProgressProps) {
  const percent = estimatedTotal > 0 ? Math.round((answeredCount / estimatedTotal) * 100) : 0;
  const clampedPercent = Math.min(percent, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Question {answeredCount} of ~{estimatedTotal}
        </span>
        <span className="font-medium">{clampedPercent}%</span>
      </div>
      <Progress value={clampedPercent} className="h-2" />
    </div>
  );
}
