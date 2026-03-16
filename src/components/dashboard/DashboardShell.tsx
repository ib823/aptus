"use client";

import { useState } from "react";
import { WidgetLoader } from "@/components/dashboard/WidgetLoader";
import type { WidgetConfig, WidgetType } from "@/types/dashboard";

interface DashboardShellProps {
  initialWidgets: WidgetConfig[];
  assessmentId: string | null;
}

/** Fixed vertical order for the four primary dashboard sections */
const PRIMARY_ORDER: WidgetType[] = ["attention", "kpi", "progress_heatmap", "activity_feed", "conflict_summary"];

/** Map widget types to data-tour selectors for guided tour targeting */
const TOUR_ATTRS: Partial<Record<WidgetType, string>> = {
  kpi: "dashboard-kpis",
  progress_heatmap: "dashboard-assessments",
};

export function DashboardShell({ initialWidgets, assessmentId }: DashboardShellProps) {
  const [widgets] = useState<WidgetConfig[]>(initialWidgets);
  const visibleWidgets = widgets
    .filter((w) => w.isVisible)
    .sort((a, b) => a.position - b.position);

  const primaryWidgets = PRIMARY_ORDER.filter((type) =>
    visibleWidgets.some((w) => w.widgetType === type),
  );
  const otherWidgets = visibleWidgets.filter(
    (w) => !PRIMARY_ORDER.includes(w.widgetType),
  );

  return (
    <div className="space-y-5">
      {primaryWidgets.map((widgetType) => (
        <div
          key={widgetType}
          data-tour={TOUR_ATTRS[widgetType]}
          className={widgetType === "attention" ? "border-l-[3px] rounded-lg" : ""}
          style={widgetType === "attention" ? { borderColor: "var(--sapCriticalColor, #e9730c)" } : undefined}
        >
          <WidgetLoader widgetType={widgetType} assessmentId={assessmentId} />
        </div>
      ))}
      {otherWidgets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {otherWidgets.map((widget, index) => (
            <div key={`${widget.widgetType}-${index}`}>
              <WidgetLoader widgetType={widget.widgetType} assessmentId={assessmentId} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
