"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface OcmSummaryProps {
  summary: {
    total: number;
    byChangeType: Record<string, number>;
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    weightedReadiness: number;
    trainingCount: number;
  };
}

export function OcmSummary({ summary }: OcmSummaryProps) {
  const readinessPercent = Math.round(summary.weightedReadiness * 100);

  const readinessColor =
    readinessPercent >= 70
      ? "text-green-600"
      : readinessPercent >= 40
        ? "text-amber-600"
        : "text-red-600";

  const readinessTrackColor =
    readinessPercent >= 70
      ? "bg-green-600"
      : readinessPercent >= 40
        ? "bg-amber-600"
        : "bg-red-600";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Impacts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{summary.total}</p>
          {summary.trainingCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{summary.trainingCount} requiring training</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Weighted Readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${readinessTrackColor}`}
                style={{ width: `${readinessPercent}%` }}
              />
            </div>
            <span className={`text-lg font-bold ${readinessColor}`}>{readinessPercent}%</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">By Change Type</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {Object.entries(summary.byChangeType).map(([key, count]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{key.replace(/_/g, " ")}</span>
              <span className="font-medium">{count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">By Severity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {Object.entries(summary.bySeverity).map(([key, count]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{key}</span>
              <span className="font-medium">{count}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">By Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {Object.entries(summary.byStatus).map(([key, count]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{key}</span>
              <span className="font-medium">{count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
