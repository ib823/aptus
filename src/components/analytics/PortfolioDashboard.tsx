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
import { PortfolioSummaryCards } from "@/components/analytics/PortfolioSummaryCards";

interface PortfolioData {
  summary: {
    totalAssessments: number;
    activeAssessments: number;
    completedAssessments: number;
    avgFitRate: number;
    avgAssessmentDurationDays: number;
  };
  fitRateByIndustry: Array<{
    industry: string;
    avgFitRate: number;
    assessmentCount: number;
  }>;
  topGaps: Array<{
    description: string;
    frequency: number;
    resolutionType: string;
  }>;
}

export function PortfolioDashboard() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/analytics/portfolio");
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to load portfolio data");
      }
      const json = (await res.json()) as { data: PortfolioData };
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">Loading portfolio analytics...</div>
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

  const maxFitRate = Math.max(
    ...data.fitRateByIndustry.map((i) => i.avgFitRate),
    1,
  );

  return (
    <div className="space-y-6">
      <PortfolioSummaryCards
        totalAssessments={data.summary.totalAssessments}
        activeAssessments={data.summary.activeAssessments}
        completedAssessments={data.summary.completedAssessments}
        avgFitRate={data.summary.avgFitRate}
        avgDurationDays={data.summary.avgAssessmentDurationDays}
      />

      {/* FIT Rate by Industry */}
      <Card>
        <CardHeader>
          <CardTitle>FIT Rate by Industry</CardTitle>
        </CardHeader>
        <CardContent>
          {data.fitRateByIndustry.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No industry data available yet.
            </p>
          ) : (
            <div className="space-y-3">
              {data.fitRateByIndustry.map((item) => (
                <div key={item.industry} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.industry}</span>
                    <span className="text-muted-foreground">
                      {item.avgFitRate.toFixed(1)}% ({item.assessmentCount}{" "}
                      assessment{item.assessmentCount !== 1 ? "s" : ""})
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{
                        width: `${(item.avgFitRate / maxFitRate) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top Gaps */}
      <Card>
        <CardHeader>
          <CardTitle>Top Gaps Across Assessments</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topGaps.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No gap data available yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gap Description</TableHead>
                  <TableHead>Resolution Type</TableHead>
                  <TableHead className="text-right">Frequency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topGaps.slice(0, 10).map((gap, i) => (
                  <TableRow key={`${gap.description}-${i}`}>
                    <TableCell className="max-w-xs truncate whitespace-normal">
                      {gap.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{gap.resolutionType}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {gap.frequency}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
