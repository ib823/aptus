"use client";

import { useState } from "react";
import { WidgetLoader } from "@/components/dashboard/WidgetLoader";
import type { WidgetConfig } from "@/types/dashboard";

interface DashboardShellProps {
  initialWidgets: WidgetConfig[];
  assessmentId: string | null;
}

export function DashboardShell({ initialWidgets, assessmentId }: DashboardShellProps) {
  const [widgets] = useState<WidgetConfig[]>(initialWidgets);
  const visibleWidgets = widgets
    .filter((w) => w.isVisible)
    .sort((a, b) => a.position - b.position);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {visibleWidgets.map((widget, index) => (
        <div
          key={`${widget.widgetType}-${index}`}
          className={
            widget.widgetType === "progress_heatmap" || widget.widgetType === "activity_feed"
              ? "md:col-span-2"
              : ""
          }
        >
          <WidgetLoader widgetType={widget.widgetType} assessmentId={assessmentId} />
        </div>
      ))}
    </div>
  );
}
