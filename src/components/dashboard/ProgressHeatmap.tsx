"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HeatmapCell } from "@/types/dashboard";

interface ProgressHeatmapProps {
  cells: HeatmapCell[];
  assessmentId?: string | null;
}

export function ProgressHeatmap({ cells, assessmentId }: ProgressHeatmapProps) {
  return (
    <Card>
      <CardHeader className="pb-3 border-b border-slate-100">
        <CardTitle className="text-sm font-semibold">Completion Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        {cells.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scope items to display.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {cells.map((cell) => {
              const content = (
                <div className="flex flex-col items-center justify-center gap-0.5 p-1.5">
                  <span className="text-sm font-semibold text-foreground/80">
                    {cell.completionPercent}%
                  </span>
                  <span className="text-[9px] leading-tight text-foreground/60 text-center line-clamp-2">
                    {cell.scopeItemName}
                  </span>
                </div>
              );
              return assessmentId ? (
                <a
                  key={cell.scopeItemId}
                  href={`/assessment/${assessmentId}/review?scopeItem=${cell.scopeItemId}`}
                  className={`rounded-lg ${cell.colorClass} hover:ring-2 hover:ring-primary/30 transition-all cursor-pointer`}
                  title={`${cell.scopeItemName}: ${cell.completionPercent}% (${cell.completedSteps}/${cell.totalSteps})`}
                >
                  {content}
                </a>
              ) : (
                <div
                  key={cell.scopeItemId}
                  className={`rounded-lg ${cell.colorClass}`}
                  title={`${cell.scopeItemName}: ${cell.completionPercent}% (${cell.completedSteps}/${cell.totalSteps})`}
                >
                  {content}
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
          <span>0%</span>
          <div className="flex gap-0.5">
            <div className="w-4 h-3 rounded-sm bg-slate-100" />
            <div className="w-4 h-3 rounded-sm bg-red-200" />
            <div className="w-4 h-3 rounded-sm bg-orange-200" />
            <div className="w-4 h-3 rounded-sm bg-yellow-200" />
            <div className="w-4 h-3 rounded-sm bg-green-200" />
            <div className="w-4 h-3 rounded-sm bg-green-400" />
          </div>
          <span>100%</span>
        </div>
      </CardContent>
    </Card>
  );
}
