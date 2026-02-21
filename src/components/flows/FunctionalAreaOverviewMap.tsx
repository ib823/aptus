"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import type { FunctionalAreaOverviewData } from "@/types/flow";

interface FunctionalAreaOverviewMapProps {
  assessmentId: string;
  initialData?: FunctionalAreaOverviewData[] | undefined;
}

function getRiskColor(score: number): string {
  if (score >= 0.7) return "bg-red-100 text-red-700 border-red-200";
  if (score >= 0.4) return "bg-amber-100 text-amber-700 border-amber-200";
  if (score > 0) return "bg-yellow-100 text-yellow-700 border-yellow-200";
  return "bg-green-100 text-green-700 border-green-200";
}

function getCompletionColor(pct: number): string {
  if (pct >= 80) return "bg-green-500";
  if (pct >= 50) return "bg-amber-500";
  if (pct > 0) return "bg-orange-500";
  return "bg-gray-300";
}

export function FunctionalAreaOverviewMap({
  assessmentId,
  initialData,
}: FunctionalAreaOverviewMapProps) {
  const [areas, setAreas] = useState<FunctionalAreaOverviewData[]>(initialData ?? []);
  const [loading, setLoading] = useState(!initialData);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/flows/overview`);
      if (res.ok) {
        const json = await res.json() as { data: FunctionalAreaOverviewData[] };
        setAreas(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    if (!initialData) {
      void fetchData();
    }
  }, [initialData, fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground/60">
        Loading overview...
      </div>
    );
  }

  if (areas.length === 0) {
    return (
      <EmptyState
        title="No Functional Areas"
        description="No scope items have been selected for this assessment yet."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Functional Area Overview"
        description={`${areas.length} functional areas across your assessment scope.`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {areas.map((area) => (
          <Card
            key={area.functionalArea}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setExpandedArea(
              expandedArea === area.functionalArea ? null : area.functionalArea,
            )}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{area.functionalArea}</CardTitle>
                <Badge variant="outline" className={getRiskColor(area.riskScore)}>
                  Risk: {(area.riskScore * 100).toFixed(0)}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {/* Completion bar */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Completion</span>
                  <span>{area.completionPct}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getCompletionColor(area.completionPct)}`}
                    style={{ width: `${area.completionPct}%` }}
                  />
                </div>
              </div>

              {/* Status counts */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div>
                  <div className="font-semibold text-green-700">{area.fitCount}</div>
                  <div className="text-muted-foreground">FIT</div>
                </div>
                <div>
                  <div className="font-semibold text-blue-700">{area.configureCount}</div>
                  <div className="text-muted-foreground">CFG</div>
                </div>
                <div>
                  <div className="font-semibold text-amber-700">{area.gapCount}</div>
                  <div className="text-muted-foreground">GAP</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-500">{area.pendingCount}</div>
                  <div className="text-muted-foreground">PEND</div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground mt-2">
                {area.selectedCount} of {area.totalScopeItems} scope items selected
              </div>

              {/* Expanded scope item list */}
              {expandedArea === area.functionalArea && area.scopeItems.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  {area.scopeItems.map((si) => (
                    <div key={si.scopeItemId} className="flex items-center justify-between text-xs">
                      <span className="truncate mr-2">{si.scopeItemName}</span>
                      <div className="flex gap-1 shrink-0">
                        {si.fitCount > 0 && <Badge variant="outline" className="bg-green-50 text-green-700 text-[10px] px-1">{si.fitCount}</Badge>}
                        {si.configureCount > 0 && <Badge variant="outline" className="bg-blue-50 text-blue-700 text-[10px] px-1">{si.configureCount}</Badge>}
                        {si.gapCount > 0 && <Badge variant="outline" className="bg-amber-50 text-amber-700 text-[10px] px-1">{si.gapCount}</Badge>}
                        {si.pendingCount > 0 && <Badge variant="outline" className="bg-gray-50 text-gray-500 text-[10px] px-1">{si.pendingCount}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
