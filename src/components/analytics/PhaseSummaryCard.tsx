"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PhaseSummaryCardProps {
  title: string;
  assessmentId: string;
  status: string;
  totalSteps: number;
  fitCount: number;
  gapCount: number;
  configCount: number;
  naCount: number;
  fitRate: number;
  scopeItemCount: number;
}

export function PhaseSummaryCard({
  title,
  status,
  totalSteps,
  fitCount,
  gapCount,
  configCount,
  naCount,
  fitRate,
  scopeItemCount,
}: PhaseSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="outline">{status}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">FIT Rate</span>
            <span className="text-lg font-bold">{fitRate.toFixed(1)}%</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center justify-between rounded bg-muted px-2 py-1">
              <span>FIT</span>
              <span className="font-medium text-green-600">{fitCount}</span>
            </div>
            <div className="flex items-center justify-between rounded bg-muted px-2 py-1">
              <span>GAP</span>
              <span className="font-medium text-red-600">{gapCount}</span>
            </div>
            <div className="flex items-center justify-between rounded bg-muted px-2 py-1">
              <span>CONFIG</span>
              <span className="font-medium text-amber-600">{configCount}</span>
            </div>
            <div className="flex items-center justify-between rounded bg-muted px-2 py-1">
              <span>N/A</span>
              <span className="font-medium text-muted-foreground">{naCount}</span>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm border-t pt-2">
            <span className="text-muted-foreground">Total Steps</span>
            <span className="font-medium">{totalSteps}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Scope Items</span>
            <span className="font-medium">{scopeItemCount}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
