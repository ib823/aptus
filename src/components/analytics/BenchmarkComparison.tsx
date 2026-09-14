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
import { BENCHMARK_SOURCE_LABEL, type BenchmarkPosition } from "@/types/analytics";

interface BenchmarkData {
  assessmentFitRate: number;
  /** Where the comparison set comes from. Rendered next to every figure. */
  source?: string;
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
        setError("Failed to load benchmark data. Please try again.");
        return;
      }
      const json = (await res.json()) as { data: BenchmarkData };
      setData(json.data);
    } catch {
      setError("Failed to load benchmark data. Please try again.");
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

  const { benchmark, comparison } = data;

  return (
    <div className="space-y-6">
      {/*
        No cohort, or a cohort below the minimum: the API withholds the figures
        and sends only the reason. Rendering a delta card here against a zeroed
        benchmark, as this component used to, printed "Benchmark: 0.0%" and
        invited the reader to treat it as a real comparison.
      */}
      {benchmark ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <BenchmarkDeltaCard
            label="FIT Rate"
            yourValue={data.assessmentFitRate}
            benchmarkValue={benchmark.avgFitRate}
          />
          <BenchmarkDeltaCard
            label="GAP Rate"
            yourValue={100 - data.assessmentFitRate - (benchmark.avgConfigRate ?? 0)}
            benchmarkValue={benchmark.avgGapRate}
            higherIsBetter={false}
          />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Position
              </CardTitle>
            </CardHeader>
            <CardContent>
              {comparison ? (
                <Badge variant={positionVariant(comparison.fitRatePercentile)}>
                  {positionLabel[comparison.fitRatePercentile]}
                </Badge>
              ) : (
                <Badge variant="secondary">Not enough data</Badge>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Across {benchmark.sampleSize} comparable ABeam engagements
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Comparison unavailable
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            No figures are shown because the comparison set is too small to
            support one.
          </CardContent>
        </Card>
      )}

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
            <CardTitle>Recurring gaps across comparable engagements</CardTitle>
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

      {/*
        Provenance travels with the figures. A percentile with no source beside
        it is what ends up in a client proposal as an "industry benchmark".
      */}
      <p className="text-xs text-muted-foreground">
        Source: {data.source ?? BENCHMARK_SOURCE_LABEL}. This is ABeam&apos;s own
        engagement history, not an external benchmarking panel.
      </p>
    </div>
  );
}
