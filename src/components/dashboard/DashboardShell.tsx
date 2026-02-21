"use client";

import { useState } from "react";
import type { WidgetConfig, WidgetType } from "@/types/dashboard";

interface DashboardShellProps {
  initialWidgets: WidgetConfig[];
  children: (widgetType: WidgetType, index: number) => React.ReactNode;
}

export function DashboardShell({ initialWidgets, children }: DashboardShellProps) {
  const [widgets] = useState<WidgetConfig[]>(initialWidgets);
  const visibleWidgets = widgets
    .filter((w) => w.isVisible)
    .sort((a, b) => a.position - b.position);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {visibleWidgets.map((widget, index) => (
        <div
          key={`${widget.widgetType}-${index}`}
          className={
            widget.widgetType === "progress_heatmap" || widget.widgetType === "activity_feed"
              ? "md:col-span-2"
              : ""
          }
        >
          {children(widget.widgetType, index)}
        </div>
      ))}
    </div>
  );
}
