/** Phase 23: Dashboard widget utilities — pure functions */

import type { UserRole } from "@/types/assessment";
import type { WidgetConfig, WidgetType } from "@/types/dashboard";
import { DEFAULT_ROLE_WIDGETS } from "@/types/dashboard";

/**
 * Get default widget configuration for a role.
 * Each role gets a curated set of widgets in a default order.
 */
export function getDefaultWidgets(role: UserRole): WidgetConfig[] {
  const widgetTypes = DEFAULT_ROLE_WIDGETS[role] ?? DEFAULT_ROLE_WIDGETS.viewer;
  return widgetTypes.map((widgetType: WidgetType, index: number) => ({
    widgetType,
    position: index,
    isVisible: true,
  }));
}

/**
 * Get a Tailwind CSS class for heatmap coloring based on completion percentage.
 */
export function getHeatmapColor(completionPercent: number): string {
  if (completionPercent === 0) return "bg-gray-100";
  if (completionPercent < 25) return "bg-red-200";
  if (completionPercent < 50) return "bg-orange-200";
  if (completionPercent < 75) return "bg-yellow-200";
  if (completionPercent < 100) return "bg-green-200";
  return "bg-green-400";
}
