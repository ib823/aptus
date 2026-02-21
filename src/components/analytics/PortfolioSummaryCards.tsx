"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PortfolioSummaryCardsProps {
  totalAssessments: number;
  activeAssessments: number;
  completedAssessments: number;
  avgFitRate: number;
  avgDurationDays: number;
}

export function PortfolioSummaryCards({
  totalAssessments,
  activeAssessments,
  completedAssessments,
  avgFitRate,
  avgDurationDays,
}: PortfolioSummaryCardsProps) {
  const cards = [
    {
      title: "Total Assessments",
      value: totalAssessments.toString(),
      description: `${activeAssessments} active, ${completedAssessments} completed`,
    },
    {
      title: "Avg FIT Rate",
      value: `${avgFitRate.toFixed(1)}%`,
      description: "Across all assessments",
    },
    {
      title: "Avg Duration",
      value: avgDurationDays > 0 ? `${avgDurationDays.toFixed(0)} days` : "N/A",
      description: "Assessment completion time",
    },
    {
      title: "Active Assessments",
      value: activeAssessments.toString(),
      description: "Currently in progress",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {card.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
