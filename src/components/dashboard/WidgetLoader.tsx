"use client";

import { useEffect, useState } from "react";
import { AttentionWidget } from "@/components/dashboard/AttentionWidget";
import { KpiPanel } from "@/components/dashboard/KpiPanel";
import { ProgressHeatmap } from "@/components/dashboard/ProgressHeatmap";
import { DeadlineTimeline } from "@/components/dashboard/DeadlineTimeline";
import { DashboardActivityFeed } from "@/components/dashboard/DashboardActivityFeed";
import { ConflictSummaryWidget } from "@/components/dashboard/ConflictSummaryWidget";
import { CardSkeleton } from "@/components/shared/LoadingSkeleton";
import type { WidgetType, AttentionItem, KpiMetrics, HeatmapCell } from "@/types/dashboard";

interface WidgetLoaderProps {
  widgetType: WidgetType;
  assessmentId: string | null;
}

/** Generic hook to fetch JSON from an API endpoint */
function useApiFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(url!);
        if (!res.ok) {
          setError(`Failed to load (${res.status})`);
          return;
        }
        const json = await res.json();
        if (!cancelled) setData(json.data);
      } catch {
        if (!cancelled) setError("Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { data, loading, error };
}

function WidgetError({ message }: { message: string }) {
  return (
    <div className="p-4 border rounded-lg bg-destructive/10 text-sm text-destructive">
      {message}
    </div>
  );
}

function WidgetPlaceholder({ widgetType }: { widgetType: WidgetType }) {
  return (
    <div className="p-4 border rounded-lg bg-muted/20 text-sm text-muted-foreground">
      {widgetType} widget
    </div>
  );
}

function AttentionLoader() {
  const { data, loading, error } = useApiFetch<AttentionItem[]>("/api/dashboard/attention");
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} />;
  return <AttentionWidget items={data ?? []} />;
}

function KpiLoader({ assessmentId }: { assessmentId: string }) {
  const { data, loading, error } = useApiFetch<KpiMetrics>(
    `/api/dashboard/kpi/${assessmentId}`,
  );
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} />;
  if (!data) return null;
  return <KpiPanel metrics={data} />;
}

function HeatmapLoader({ assessmentId }: { assessmentId: string }) {
  const { data, loading, error } = useApiFetch<HeatmapCell[]>(
    `/api/dashboard/heatmap/${assessmentId}`,
  );
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} />;
  return <ProgressHeatmap cells={data ?? []} />;
}

interface Deadline {
  id: string;
  title: string;
  description?: string | null;
  dueDate: string;
  status: "pending" | "at_risk" | "overdue" | "completed";
  assignedRole?: string | null;
}

function DeadlineLoader() {
  const { data, loading, error } = useApiFetch<Deadline[]>("/api/dashboard/deadlines");
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} />;
  return <DeadlineTimeline deadlines={data ?? []} />;
}

interface ActivityEntry {
  id: string;
  actorName: string;
  actorRole: string;
  actionType: string;
  summary: string;
  createdAt: string;
}

function ActivityLoader() {
  const { data, loading, error } = useApiFetch<ActivityEntry[]>("/api/dashboard/activity");
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} />;
  return <DashboardActivityFeed entries={data ?? []} />;
}

interface ConflictData {
  id: string;
  entityType: string;
  entityId: string;
  status: string;
  createdAt: string;
}

function ConflictLoader() {
  const { data, loading, error } = useApiFetch<ConflictData[]>("/api/dashboard/conflicts");
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} />;
  return <ConflictSummaryWidget conflicts={data ?? []} />;
}

export function WidgetLoader({ widgetType, assessmentId }: WidgetLoaderProps) {
  switch (widgetType) {
    case "attention":
      return <AttentionLoader />;
    case "kpi":
      return assessmentId ? <KpiLoader assessmentId={assessmentId} /> : null;
    case "progress_heatmap":
      return assessmentId ? <HeatmapLoader assessmentId={assessmentId} /> : null;
    case "deadlines":
      return <DeadlineLoader />;
    case "activity_feed":
      return <ActivityLoader />;
    case "conflict_summary":
      return <ConflictLoader />;
    default:
      return <WidgetPlaceholder widgetType={widgetType} />;
  }
}
