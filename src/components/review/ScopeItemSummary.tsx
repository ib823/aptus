"use client";

import { useMemo } from "react";
import type { HierarchyTree } from "@/types/hierarchy";
import { SCOPE_BUSINESS_SUMMARIES } from "@/constants/scope-summaries";

interface ScopeItemSummaryProps {
  scopeItemId: string;
  scopeItemName: string;
  tree: HierarchyTree;
  classifiableProgress: {
    totalClassifiable: number;
    totalClassified: number;
    totalSteps: number;
    percentage: number;
  };
}

export function ScopeItemSummary({
  scopeItemId,
  scopeItemName,
  tree,
  classifiableProgress,
}: ScopeItemSummaryProps) {
  const stats = useMemo(() => {
    let totalActivities = 0;
    let totalFlows = 0;
    for (const process of tree.processes) {
      for (const flow of process.flows) {
        totalFlows++;
        totalActivities += flow.activities.length;
      }
    }
    return { totalActivities, totalFlows };
  }, [tree]);

  const businessSummary = SCOPE_BUSINESS_SUMMARIES[scopeItemId] ?? null;
  const remainingSteps = classifiableProgress.totalClassifiable - classifiableProgress.totalClassified;
  const estimatedMinutes = Math.ceil(remainingSteps * 1);
  const hours = Math.floor(estimatedMinutes / 60);
  const mins = estimatedMinutes % 60;
  const timeLabel = hours > 0 ? `~${hours}h ${mins}m` : `~${mins} min`;

  return (
    <div className="mb-6 p-5 bg-card rounded-lg border">
      <h2 className="text-lg font-semibold text-foreground">{scopeItemName}</h2>

      {businessSummary && (
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {businessSummary}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{stats.totalActivities}</strong> activities
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-violet-500" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{classifiableProgress.totalSteps}</strong> total steps
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{classifiableProgress.totalClassifiable}</strong> need your input
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-muted-foreground">
            <strong className="text-foreground">{classifiableProgress.totalClassified}</strong> reviewed
          </span>
        </div>
        {remainingSteps > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground/70">
            {timeLabel} remaining
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground/70 mt-3 italic">
        Click any activity card below to start reviewing its steps. Only classifiable steps will require your input.
      </p>
    </div>
  );
}
