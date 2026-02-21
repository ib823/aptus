"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { GripVertical, Settings } from "lucide-react";
import type { WidgetConfig, WidgetType } from "@/types/dashboard";

interface WidgetCustomizerProps {
  widgets: WidgetConfig[];
  onSave: (widgets: WidgetConfig[]) => void;
  isSaving?: boolean | undefined;
}

const WIDGET_LABELS: Record<WidgetType, string> = {
  attention: "Needs Attention",
  progress_heatmap: "Progress Heatmap",
  kpi: "KPI Metrics",
  deadlines: "Deadlines",
  activity_feed: "Activity Feed",
  conflict_summary: "Conflict Summary",
  gap_overview: "Gap Overview",
  scope_progress: "Scope Progress",
  workshop_status: "Workshop Status",
  data_migration: "Data Migration",
  ocm_readiness: "OCM Readiness",
};

export function WidgetCustomizer({ widgets, onSave, isSaving }: WidgetCustomizerProps) {
  const [localWidgets, setLocalWidgets] = useState<WidgetConfig[]>(widgets);

  const toggleVisibility = (index: number) => {
    setLocalWidgets((prev) =>
      prev.map((w, i) => (i === index ? { ...w, isVisible: !w.isVisible } : w)),
    );
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setLocalWidgets((prev) => {
      const next = [...prev];
      const swapA = next[index - 1];
      const swapB = next[index];
      if (swapA && swapB) {
        next[index - 1] = { ...swapB, position: index - 1 };
        next[index] = { ...swapA, position: index };
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Customize Dashboard</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {localWidgets.map((widget, index) => (
            <div
              key={`${widget.widgetType}-${index}`}
              className="flex items-center gap-3 p-2 rounded-lg border"
            >
              <button
                onClick={() => moveUp(index)}
                disabled={index === 0}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Move up"
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <span className="text-sm flex-1">
                {WIDGET_LABELS[widget.widgetType] ?? widget.widgetType}
              </span>
              <Switch
                checked={widget.isVisible}
                onCheckedChange={() => toggleVisibility(index)}
              />
            </div>
          ))}
        </div>
        <Button
          onClick={() => onSave(localWidgets)}
          disabled={isSaving ?? false}
          className="mt-4 w-full"
          size="sm"
        >
          {isSaving ? "Saving..." : "Save Layout"}
        </Button>
      </CardContent>
    </Card>
  );
}
