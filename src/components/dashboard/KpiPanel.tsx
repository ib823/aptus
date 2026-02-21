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
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
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
          <div className="p-2 rounded bg-green-50">
            <span className="text-lg font-bold text-green-700">{metrics.fitCount}</span>
            <p className="text-xs text-green-600">FIT</p>
          </div>
          <div className="p-2 rounded bg-blue-50">
            <span className="text-lg font-bold text-blue-700">{metrics.configureCount}</span>
            <p className="text-xs text-blue-600">CONFIG</p>
          </div>
          <div className="p-2 rounded bg-amber-50">
            <span className="text-lg font-bold text-amber-700">{metrics.gapCount}</span>
            <p className="text-xs text-amber-600">GAP</p>
          </div>
          <div className="p-2 rounded bg-gray-50">
            <span className="text-lg font-bold text-gray-700">{metrics.naCount}</span>
            <p className="text-xs text-gray-600">N/A</p>
          </div>
          <div className="p-2 rounded bg-muted">
            <span className="text-lg font-bold text-muted-foreground">{metrics.pendingCount}</span>
            <p className="text-xs text-muted-foreground">PENDING</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
