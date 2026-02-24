"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { KpiMetrics } from "@/types/dashboard";

interface KpiPanelProps {
  metrics: KpiMetrics;
}

function KpiCard({
  label,
  value,
  total,
  percent,
  color,
}: {
  label: string;
  value: number;
  total: number;
  percent: number;
  color: string;
}) {
  return (
    <div className="p-3 rounded-lg border bg-card">
      <p className="text-xs text-muted-foreground tracking-wide">{label}</p>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-sm text-muted-foreground">/ {total}</span>
      </div>
      <Progress value={percent} className={`h-1.5 mt-2 ${color}`} />
      <p className="text-xs text-muted-foreground mt-1">{percent}% complete</p>
    </div>
  );
}

export function KpiPanel({ metrics }: KpiPanelProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Key Performance Indicators</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Overall Progress"
            value={metrics.completedSteps}
            total={metrics.totalSteps}
            percent={metrics.completionPercent}
            color=""
          />
          <KpiCard
            label="Gap Resolution"
            value={metrics.resolvedGaps}
            total={metrics.totalGaps}
            percent={metrics.gapResolutionPercent}
            color=""
          />
          <KpiCard
            label="Integrations"
            value={metrics.completedIntegrations}
            total={metrics.totalIntegrations}
            percent={metrics.integrationPercent}
            color=""
          />
          <KpiCard
            label="Data Migration"
            value={metrics.completedMigrations}
            total={metrics.totalMigrations}
            percent={metrics.migrationPercent}
            color=""
          />
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2 text-center">
          <div className="p-2 rounded" style={{ backgroundColor: "var(--status-fit-bg)" }}>
            <span className="text-lg font-bold" style={{ color: "var(--status-fit-fg)" }}>{metrics.fitCount}</span>
            <p className="text-xs" style={{ color: "var(--status-fit-fg)" }}>Fit</p>
          </div>
          <div className="p-2 rounded" style={{ backgroundColor: "var(--status-configure-bg)" }}>
            <span className="text-lg font-bold" style={{ color: "var(--status-configure-fg)" }}>{metrics.configureCount}</span>
            <p className="text-xs" style={{ color: "var(--status-configure-fg)" }}>Config</p>
          </div>
          <div className="p-2 rounded" style={{ backgroundColor: "var(--status-extend-bg)" }}>
            <span className="text-lg font-bold" style={{ color: "var(--status-extend-fg)" }}>{metrics.gapCount}</span>
            <p className="text-xs" style={{ color: "var(--status-extend-fg)" }}>Gap</p>
          </div>
          <div className="p-2 rounded" style={{ backgroundColor: "var(--status-na-bg)" }}>
            <span className="text-lg font-bold" style={{ color: "var(--status-na-fg)" }}>{metrics.naCount}</span>
            <p className="text-xs" style={{ color: "var(--status-na-fg)" }}>N/A</p>
          </div>
          <div className="p-2 rounded" style={{ backgroundColor: "var(--status-pending-bg)" }}>
            <span className="text-lg font-bold" style={{ color: "var(--status-pending-fg)" }}>{metrics.pendingCount}</span>
            <p className="text-xs" style={{ color: "var(--status-pending-fg)" }}>Pending</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
