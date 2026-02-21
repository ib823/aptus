"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ReadinessScorecard, ReadinessStatus, GoNoGoDecision } from "@/types/report";

interface ReadinessScorecardViewProps {
  scorecard: ReadinessScorecard;
}

const STATUS_COLORS: Record<ReadinessStatus, string> = {
  green: "text-green-600",
  amber: "text-amber-600",
  red: "text-red-600",
};

const STATUS_BG: Record<ReadinessStatus, string> = {
  green: "bg-green-100 text-green-800 border-green-300",
  amber: "bg-amber-100 text-amber-800 border-amber-300",
  red: "bg-red-100 text-red-800 border-red-300",
};

const GONOGO_VARIANT: Record<GoNoGoDecision, "default" | "secondary" | "destructive"> = {
  go: "default",
  conditional_go: "secondary",
  no_go: "destructive",
};

const GONOGO_LABELS: Record<GoNoGoDecision, string> = {
  go: "GO",
  conditional_go: "CONDITIONAL GO",
  no_go: "NO GO",
};

function progressColorClass(status: ReadinessStatus): string {
  if (status === "green") return "[&_[data-slot=progress-indicator]]:bg-green-500";
  if (status === "amber") return "[&_[data-slot=progress-indicator]]:bg-amber-500";
  return "[&_[data-slot=progress-indicator]]:bg-red-500";
}

export function ReadinessScorecardView({ scorecard }: ReadinessScorecardViewProps) {
  return (
    <div className="space-y-6">
      {/* Overall Score Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className={`text-5xl font-bold ${STATUS_COLORS[scorecard.overallStatus]}`}>
                  {scorecard.overallScore}%
                </div>
                <div className="text-sm text-muted-foreground mt-1">Overall Readiness</div>
              </div>
              <Badge variant={GONOGO_VARIANT[scorecard.goNoGo]} className="text-lg px-4 py-1">
                {GONOGO_LABELS[scorecard.goNoGo]}
              </Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            {scorecard.executiveSummary}
          </p>
        </CardContent>
      </Card>

      {/* Category Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {scorecard.categories.map((category) => (
          <Card key={category.category}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {category.category}
                </CardTitle>
                <Badge variant="outline" className={STATUS_BG[category.status]}>
                  {category.score}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Progress
                value={category.score}
                className={progressColorClass(category.status)}
              />

              {category.findings.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Findings
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-0.5">
                    {category.findings.map((f, i) => (
                      <li key={i}>- {f}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {category.recommendations.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Recommendations
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-0.5">
                    {category.recommendations.map((r, i) => (
                      <li key={i}>- {r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
