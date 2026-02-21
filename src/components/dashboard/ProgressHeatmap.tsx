"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HeatmapCell } from "@/types/dashboard";

interface ProgressHeatmapProps {
  cells: HeatmapCell[];
}

export function ProgressHeatmap({ cells }: ProgressHeatmapProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Completion Heatmap</CardTitle>
      </CardHeader>
      <CardContent>
        {cells.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scope items to display.</p>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1">
            {cells.map((cell) => (
              <div
                key={cell.scopeItemId}
                className={`aspect-square rounded ${cell.colorClass} flex items-center justify-center cursor-default group relative`}
                title={`${cell.scopeItemName}: ${cell.completionPercent}% (${cell.completedSteps}/${cell.totalSteps})`}
              >
                <span className="text-[10px] font-medium text-foreground/70">
                  {cell.completionPercent}%
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
          <span>0%</span>
          <div className="flex gap-0.5">
            <div className="w-4 h-3 rounded-sm bg-gray-100" />
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
