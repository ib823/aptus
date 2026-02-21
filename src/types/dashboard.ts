/** Phase 23: Intelligent Dashboard Types */

import type { UserRole } from "@/types/assessment";

/** Widget types available in the dashboard */
export type WidgetType =
  | "attention"
  | "progress_heatmap"
  | "kpi"
  | "deadlines"
  | "activity_feed"
  | "conflict_summary"
  | "gap_overview"
  | "scope_progress"
  | "workshop_status"
  | "data_migration"
  | "ocm_readiness";

/** Severity levels for attention items */
export type AttentionSeverity = "info" | "warning" | "critical";

/** Status for deadlines */
export type DeadlineStatus = "pending" | "at_risk" | "overdue" | "completed";

/** Widget settings stored as JSON */
export interface WidgetSettings {
  collapsed?: boolean | undefined;
  filters?: Record<string, string> | undefined;
  pageSize?: number | undefined;
}

/** Widget configuration for display */
export interface WidgetConfig {
  widgetType: WidgetType;
  position: number;
  isVisible: boolean;
  settings?: WidgetSettings | undefined;
}

/** An attention item requiring user action */
export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  title: string;
  description: string;
  entityType: string;
  entityId: string;
  actionUrl?: string | undefined;
  createdAt: string;
}

/** KPI metrics for executive dashboard */
export interface KpiMetrics {
  totalSteps: number;
  completedSteps: number;
  completionPercent: number;
  fitCount: number;
  configureCount: number;
  gapCount: number;
  naCount: number;
  pendingCount: number;
  totalGaps: number;
  resolvedGaps: number;
  gapResolutionPercent: number;
  totalIntegrations: number;
  completedIntegrations: number;
  integrationPercent: number;
  totalMigrations: number;
  completedMigrations: number;
  migrationPercent: number;
  ocmAverageScore: number;
  ocmHighImpactCount: number;
}

/** Heatmap cell data for progress visualization */
export interface HeatmapCell {
  scopeItemId: string;
  scopeItemName: string;
  completionPercent: number;
  totalSteps: number;
  completedSteps: number;
  colorClass: string;
}

/** Default widget configurations per role */
export const DEFAULT_ROLE_WIDGETS: Record<UserRole, WidgetType[]> = {
  platform_admin: ["attention", "kpi", "activity_feed", "conflict_summary", "progress_heatmap"],
  partner_lead: ["attention", "kpi", "progress_heatmap", "deadlines", "activity_feed"],
  consultant: ["attention", "progress_heatmap", "gap_overview", "activity_feed", "deadlines"],
  project_manager: ["attention", "deadlines", "kpi", "progress_heatmap", "activity_feed"],
  solution_architect: ["attention", "gap_overview", "conflict_summary", "progress_heatmap", "activity_feed"],
  process_owner: ["attention", "scope_progress", "gap_overview", "deadlines", "activity_feed"],
  it_lead: ["attention", "data_migration", "gap_overview", "progress_heatmap", "activity_feed"],
  data_migration_lead: ["attention", "data_migration", "deadlines", "kpi", "activity_feed"],
  executive_sponsor: ["kpi", "attention", "deadlines", "progress_heatmap", "ocm_readiness"],
  viewer: ["kpi", "progress_heatmap", "activity_feed"],
  client_admin: ["attention", "kpi", "deadlines", "progress_heatmap", "activity_feed"],
};
