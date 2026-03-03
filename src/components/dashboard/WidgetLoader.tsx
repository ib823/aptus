"use client";

import { useEffect, useState, useCallback } from "react";
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

const FETCH_TIMEOUT_MS = 15_000;

/** Generic hook to fetch JSON from an API endpoint with retry + timeout */
function useApiFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => setRetryCount((c) => c + 1), []);

  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const timeout = setTimeout(() => {
      if (!cancelled) {
        cancelled = true;
        setError("Request timed out");
        setLoading(false);
      }
    }, FETCH_TIMEOUT_MS);

    async function load() {
      try {
        const res = await fetch(url!);
        if (cancelled) return;
        if (!res.ok) {
          if (!cancelled) setError("Unable to load this section");
          return;
        }
        const json = await res.json();
        if (!cancelled) setData(json.data);
      } catch {
        if (!cancelled) setError("Unable to load this section");
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [url, retryCount]);

  return { data, loading, error, retry };
}

function WidgetError({ onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="p-4 border rounded-lg text-sm text-muted-foreground" style={{ background: "var(--sapNeutralBackground, #f5f6f7)" }}>
      <p>Unable to load this section right now.</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-primary hover:underline text-sm font-medium"
        >
          Try again
        </button>
      )}
    </div>
  );
}

function WidgetPlaceholder({ widgetType }: { widgetType: WidgetType }) {
  return (
    <div className="p-4 border rounded-lg text-sm text-muted-foreground" style={{ background: "var(--sapNeutralBackground, #f5f6f7)" }}>
      {widgetType} widget
    </div>
  );
}

function AttentionLoader() {
  const { data, loading, error, retry } = useApiFetch<AttentionItem[]>("/api/dashboard/attention");
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} onRetry={retry} />;
  return <AttentionWidget items={data ?? []} />;
}

function KpiLoader({ assessmentId }: { assessmentId: string }) {
  const { data, loading, error, retry } = useApiFetch<KpiMetrics>(
    `/api/dashboard/kpi/${assessmentId}`,
  );
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} onRetry={retry} />;
  if (!data) return null;
  return <KpiPanel metrics={data} />;
}

function HeatmapLoader({ assessmentId }: { assessmentId: string }) {
  const { data, loading, error, retry } = useApiFetch<HeatmapCell[]>(
    `/api/dashboard/heatmap/${assessmentId}`,
  );
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} onRetry={retry} />;
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
  const { data, loading, error, retry } = useApiFetch<Deadline[]>("/api/dashboard/deadlines");
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} onRetry={retry} />;
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
  const { data, loading, error, retry } = useApiFetch<ActivityEntry[]>("/api/dashboard/activity");
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} onRetry={retry} />;
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
  const { data, loading, error, retry } = useApiFetch<ConflictData[]>("/api/dashboard/conflicts");
  if (loading) return <CardSkeleton />;
  if (error) return <WidgetError message={error} onRetry={retry} />;
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
