"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface IntegrationSummaryProps {
  summary: {
    total: number;
    byDirection: Record<string, number>;
    byStatus: Record<string, number>;
    byComplexity: Record<string, number>;
    byInterfaceType: Record<string, number>;
  };
}

export function IntegrationSummary({ summary }: IntegrationSummaryProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{summary.total}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">By Direction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {Object.entries(summary.byDirection).map(([key, count]) => (
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">By Interface Type</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {Object.entries(summary.byInterfaceType).map(([key, count]) => (
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
