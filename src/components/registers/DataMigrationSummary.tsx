"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format/number";

interface DataMigrationSummaryProps {
  summary: {
    total: number;
    byObjectType: Record<string, number>;
    byStatus: Record<string, number>;
    byMappingComplexity: Record<string, number>;
    totalRecordCount: number;
  };
}

export function DataMigrationSummary({ summary }: DataMigrationSummaryProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Objects</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{formatNumber(summary.total)}</p>
          {summary.totalRecordCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{formatNumber(summary.totalRecordCount)} total records</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">By Object Type</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {Object.entries(summary.byObjectType).map(([key, count]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{key.replace(/_/g, " ")}</span>
              <span className="font-medium">{formatNumber(count)}</span>
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
              <span className="font-medium">{formatNumber(count)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
