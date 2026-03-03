"use client";

import { CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActivityCompletionCardProps {
  activityTitle: string;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  naCount: number;
  onContinue: () => void;
  onBack: () => void;
  hasNextActivity: boolean;
}

export function ActivityCompletionCard({
  activityTitle,
  fitCount,
  configureCount,
  gapCount,
  naCount,
  onContinue,
  onBack,
  hasNextActivity,
}: ActivityCompletionCardProps) {
  const displayTitle = activityTitle === "__main_activity__" ? "Process Steps" : activityTitle;

  return (
    <div className="bg-card rounded-lg border p-6 text-center max-w-md mx-auto">
      <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-foreground mb-1">Activity Complete</h3>
      <p className="text-sm text-muted-foreground mb-4">
        All classifiable steps in &ldquo;{displayTitle}&rdquo; have been reviewed.
      </p>

      {/* Summary */}
      <div className="flex justify-center gap-4 mb-6 text-xs">
        {fitCount > 0 && (
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--sapPositiveColor, #256f3a)" }} />
            <span>{fitCount} FIT</span>
          </div>
        )}
        {configureCount > 0 && (
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--sapInformativeColor, #0070f2)" }} />
            <span>{configureCount} CONFIGURE</span>
          </div>
        )}
        {gapCount > 0 && (
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--sapCriticalColor, #e9730c)" }} />
            <span>{gapCount} GAP</span>
          </div>
        )}
        {naCount > 0 && (
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--sapNeutralColor, #6a6d70)" }} />
            <span>{naCount} N/A</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back to Map
        </Button>
        {hasNextActivity && (
          <Button size="sm" onClick={onContinue}>
            Next Activity
            <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
