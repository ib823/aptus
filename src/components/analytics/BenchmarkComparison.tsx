"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BenchmarkDeltaCard } from "@/components/analytics/BenchmarkDeltaCard";
import type { BenchmarkPosition } from "@/types/analytics";

interface BenchmarkData {
  assessmentFitRate: number;
  benchmark: {
    industry: string;
    sampleSize: number;
    avgFitRate: number;
    avgGapRate: number;
    avgConfigRate: number;
    medianFitRate: number | null;
    p25FitRate: number | null;
    p75FitRate: number | null;
  } | null;
  comparison: {
    fitRateDelta: number;
    fitRatePercentile: BenchmarkPosition;
  } | null;
  insights: string[];
  commonGaps?: Array<{
    description: string;
    frequency: number;
    resolutionType: string;
    presentInAssessment: boolean;
  }>;
}

interface BenchmarkComparisonProps {
  assessmentId: string;
}

export function BenchmarkComparison({ assessmentId }: BenchmarkComparisonProps) {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/analytics/benchmarks/${assessmentId}`);
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to load benchmark data");
      }
      const json = (await res.json()) as { data: BenchmarkData };
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading benchmark data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-destructive">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const positionLabel: Record<BenchmarkPosition, string> = {
    above_average: "Above Average",
    average: "Average",
    below_average: "Below Average",
  };

  const positionVariant = (p: BenchmarkPosition) => {
    if (p === "above_average") return "default" as const;
    if (p === "below_average") return "destructive" as const;
    return "secondary" as const;
  };

  return (
    <div className="space-y-6">
      {/* Delta Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BenchmarkDeltaCard
          label="FIT Rate"
          yourValue={data.assessmentFitRate}
          benchmarkValue={data.benchmark?.avgFitRate ?? 0}
        />
        {data.benchmark && (
          <>
            <BenchmarkDeltaCard
              label="GAP Rate"
              yourValue={100 - data.assessmentFitRate - (data.benchmark.avgConfigRate ?? 0)}
              benchmarkValue={data.benchmark.avgGapRate}
              higherIsBetter={false}
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Position
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.comparison && (
                  <Badge variant={positionVariant(data.comparison.fitRatePercentile)}>
                    {positionLabel[data.comparison.fitRatePercentile]}
                  </Badge>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Based on {data.benchmark.sampleSize} assessments
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {data.insights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Common Gaps */}
      {data.commonGaps && data.commonGaps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Industry Common Gaps</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gap Description</TableHead>
                  <TableHead>Resolution Type</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>In Your Assessment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.commonGaps.map((gap, i) => (
                  <TableRow key={`${gap.description}-${i}`}>
                    <TableCell className="max-w-xs whitespace-normal">
                      {gap.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{gap.resolutionType}</Badge>
                    </TableCell>
                    <TableCell>{gap.frequency}</TableCell>
                    <TableCell>
                      {gap.presentInAssessment ? (
                        <Badge variant="default">Yes</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
