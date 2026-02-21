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
import { PhaseSummaryCard } from "@/components/analytics/PhaseSummaryCard";
import type { ScopeDelta, ClassificationDelta } from "@/types/analytics";

interface PhaseLink {
  id: string;
  clientIdentifier: string;
  phase1AssessmentId: string;
  phase2AssessmentId: string;
  scopeDelta: ScopeDelta | null;
  classificationDelta: ClassificationDelta | null;
  linkedAt: string;
}

interface PhaseSummary {
  assessmentId: string;
  companyName: string;
  status: string;
  completedAt: string | null;
  totalSteps: number;
  fitCount: number;
  gapCount: number;
  configCount: number;
  naCount: number;
  fitRate: number;
  scopeItemCount: number;
}

interface CrossPhaseData {
  links: PhaseLink[];
  phaseSummaries: PhaseSummary[];
  insights: string[];
}

interface CrossPhaseAnalyticsProps {
  assessmentId: string;
}

export function CrossPhaseAnalytics({ assessmentId }: CrossPhaseAnalyticsProps) {
  const [data, setData] = useState<CrossPhaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/analytics/cross-phase/${assessmentId}`);
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Failed to load cross-phase data");
      }
      const json = (await res.json()) as { data: CrossPhaseData };
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
        <div className="text-muted-foreground">Loading cross-phase analytics...</div>
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

  if (!data || data.links.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No cross-phase links found for this assessment.
          </p>
        </CardContent>
      </Card>
    );
  }

  const latestLink = data.links[0];
  const p1Summary = latestLink
    ? data.phaseSummaries.find(
        (s) => s.assessmentId === latestLink.phase1AssessmentId,
      )
    : undefined;
  const p2Summary = latestLink
    ? data.phaseSummaries.find(
        (s) => s.assessmentId === latestLink.phase2AssessmentId,
      )
    : undefined;

  const scopeDelta = latestLink?.scopeDelta ?? null;
  const classificationDelta = latestLink?.classificationDelta ?? null;

  return (
    <div className="space-y-6">
      {/* Phase Summaries Side by Side */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {p1Summary && (
          <PhaseSummaryCard
            title={`Phase 1: ${p1Summary.companyName}`}
            assessmentId={p1Summary.assessmentId}
            status={p1Summary.status}
            totalSteps={p1Summary.totalSteps}
            fitCount={p1Summary.fitCount}
            gapCount={p1Summary.gapCount}
            configCount={p1Summary.configCount}
            naCount={p1Summary.naCount}
            fitRate={p1Summary.fitRate}
            scopeItemCount={p1Summary.scopeItemCount}
          />
        )}
        {p2Summary && (
          <PhaseSummaryCard
            title={`Phase 2: ${p2Summary.companyName}`}
            assessmentId={p2Summary.assessmentId}
            status={p2Summary.status}
            totalSteps={p2Summary.totalSteps}
            fitCount={p2Summary.fitCount}
            gapCount={p2Summary.gapCount}
            configCount={p2Summary.configCount}
            naCount={p2Summary.naCount}
            fitRate={p2Summary.fitRate}
            scopeItemCount={p2Summary.scopeItemCount}
          />
        )}
      </div>

      {/* Scope Delta */}
      {scopeDelta && (
        <Card>
          <CardHeader>
            <CardTitle>Scope Changes</CardTitle>
          </CardHeader>
          <CardContent>
            {scopeDelta.added.length === 0 &&
            scopeDelta.removed.length === 0 &&
            scopeDelta.changed.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No scope changes between phases.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Scope Item</TableHead>
                    <TableHead>Change Type</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scopeDelta.added.map((id) => (
                    <TableRow key={`added-${id}`}>
                      <TableCell className="font-medium">{id}</TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-800">
                          Added
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        New in Phase 2
                      </TableCell>
                    </TableRow>
                  ))}
                  {scopeDelta.removed.map((id) => (
                    <TableRow key={`removed-${id}`}>
                      <TableCell className="font-medium">{id}</TableCell>
                      <TableCell>
                        <Badge className="bg-red-100 text-red-800">
                          Removed
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        Removed in Phase 2
                      </TableCell>
                    </TableRow>
                  ))}
                  {scopeDelta.changed.map((c) => (
                    <TableRow key={`changed-${c.scopeItemId}`}>
                      <TableCell className="font-medium">
                        {c.scopeItemId}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-amber-100 text-amber-800">
                          Changed
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.from} &rarr; {c.to}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Classification Changes */}
      {classificationDelta && (
        <Card>
          <CardHeader>
            <CardTitle>Classification Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded border p-3 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {classificationDelta.gapToFit}
                </div>
                <div className="text-xs text-muted-foreground">GAP to FIT</div>
              </div>
              <div className="rounded border p-3 text-center">
                <div className="text-2xl font-bold text-red-600">
                  {classificationDelta.fitToGap}
                </div>
                <div className="text-xs text-muted-foreground">FIT to GAP</div>
              </div>
              <div className="rounded border p-3 text-center">
                <div className="text-2xl font-bold text-amber-600">
                  {classificationDelta.fitToConfig}
                </div>
                <div className="text-xs text-muted-foreground">
                  FIT to CONFIG
                </div>
              </div>
              <div className="rounded border p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {classificationDelta.configToFit}
                </div>
                <div className="text-xs text-muted-foreground">
                  CONFIG to FIT
                </div>
              </div>
              <div className="rounded border p-3 text-center">
                <div className="text-2xl font-bold">
                  {classificationDelta.newItems}
                </div>
                <div className="text-xs text-muted-foreground">New Items</div>
              </div>
              <div className="rounded border p-3 text-center">
                <div className="text-2xl font-bold">
                  {classificationDelta.removedItems}
                </div>
                <div className="text-xs text-muted-foreground">
                  Removed Items
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trend Insights */}
      {data.insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Trend Insights</CardTitle>
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
      )}
    </div>
  );
}
