"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActivityProgressBadge } from "./ActivityProgressBadge";
import type { ActivityNode } from "@/types/hierarchy";
import type { StepInGroup } from "@/lib/assessment/step-grouper";

interface ActivityPanelProps {
  activity: ActivityNode;
  steps: StepInGroup[];
  currentStepIndex: number;
  onStepSelect: (index: number) => void;
  onBack: () => void;
}

export function ActivityPanel({
  activity,
  steps,
  currentStepIndex,
  onStepSelect,
  onBack,
}: ActivityPanelProps) {
  const displayTitle = activity.title === "__main_activity__" ? "Process Steps" : activity.title;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-2 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Back to Map
        </Button>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground truncate" title={displayTitle}>
            {displayTitle}
          </h3>
          <ActivityProgressBadge
            reviewed={activity.reviewedCount}
            total={activity.stepCount}
            gapCount={activity.gapCount}
          />
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${activity.stepCount > 0 ? (activity.reviewedCount / activity.stepCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Step list */}
      <div className="flex-1 overflow-y-auto py-1">
        {steps.map((step, i) => (
          <button
            key={step.id}
            onClick={() => onStepSelect(i)}
            className={`w-full text-left px-4 py-2 flex items-center gap-2 transition-colors ${
              i === currentStepIndex
                ? "bg-blue-50 border-l-2 border-blue-500"
                : "hover:bg-accent border-l-2 border-transparent"
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              step.fitStatus === "FIT" ? "bg-green-500"
              : step.fitStatus === "CONFIGURE" ? "bg-blue-500"
              : step.fitStatus === "GAP" ? "bg-amber-500"
              : step.fitStatus === "NA" ? "bg-slate-300"
              : "bg-gray-200"
            }`} />
            <span className="text-xs text-foreground truncate">{step.actionTitle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
