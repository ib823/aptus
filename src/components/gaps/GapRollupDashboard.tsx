"use client";

import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import type { CostRollupV2, RiskHeatMap, UpgradeImpactSummary } from "@/lib/assessment/gap-analytics";
import { formatNumber } from "@/lib/format/number";

interface ApprovalStatus {
  total: number;
  approved: number;
  pending: number;
  unresolvedCount: number;
}

interface GapRollupDashboardProps {
  costRollup: CostRollupV2;
  riskHeatMap: RiskHeatMap;
  upgradeImpact: UpgradeImpactSummary;
  approvalStatus: ApprovalStatus;
}

function formatCurrency(value: number): string {
  if (value === 0) return "$0";
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

const RISK_LEVEL_COLORS: Record<string, string> = {
  LOW: "bg-green-50 text-green-700",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-red-50 text-red-700",
};

const STRATEGY_LABELS: Record<string, string> = {
  standard_upgrade: "Standard Upgrade",
  needs_revalidation: "Needs Revalidation",
  custom_maintenance: "Custom Maintenance",
};

const STRATEGY_COLORS: Record<string, string> = {
  standard_upgrade: "bg-green-50 text-green-700",
  needs_revalidation: "bg-blue-50 text-blue-700",
  custom_maintenance: "bg-amber-50 text-amber-700",
};

export function GapRollupDashboard({
  costRollup,
  riskHeatMap,
  upgradeImpact,
  approvalStatus,
}: GapRollupDashboardProps) {
  const approvalPercent = approvalStatus.total > 0
    ? Math.round((approvalStatus.approved / approvalStatus.total) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Cost Summary */}
      <div className="bg-card rounded-lg border p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Cost Summary
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{formatCurrency(costRollup.totalOneTimeCost)}</p>
            <p className="text-xs text-muted-foreground">One-Time</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{formatCurrency(costRollup.totalRecurringCost)}</p>
            <p className="text-xs text-muted-foreground">Annual Recurring</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-foreground">{formatNumber(costRollup.totalImplementationDays)}</p>
            <p className="text-xs text-muted-foreground">Effort Days</p>
          </div>
        </div>
        {Object.keys(costRollup.byResolutionType).length > 0 && (
          <div className="mt-3 pt-3 border-t space-y-1">
            {Object.entries(costRollup.byResolutionType)
              .sort(([, a], [, b]) => b.oneTime - a.oneTime)
              .map(([type, data]) => (
                <div key={type} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{type} ({formatNumber(data.count)})</span>
                  <span className="font-medium">{formatCurrency(data.oneTime)}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Risk Heatmap */}
      <div className="bg-card rounded-lg border p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Risk Heatmap
        </h3>
        <div className="grid grid-cols-4 gap-1 text-xs">
          {/* Header row */}
          <div />
          {["LOW", "MEDIUM", "HIGH"].map((level) => (
            <div key={level} className="text-center font-medium text-muted-foreground py-1">
              {level}
            </div>
          ))}
          {/* Data rows */}
          {["technical", "business", "compliance", "integration"].map((category) => (
            <Fragment key={category}>
              <div className="capitalize text-muted-foreground py-1 pr-2 truncate" title={category}>
                {category}
              </div>
              {["LOW", "MEDIUM", "HIGH"].map((level) => {
                const cell = riskHeatMap.cells.find(
                  (c) => c.category === category && c.level === level,
                );
                const count = cell?.count ?? 0;
                return (
                  <div
                    key={`${category}-${level}`}
                    className={`text-center py-1 rounded ${
                      count > 0 ? RISK_LEVEL_COLORS[level] ?? "" : "bg-muted/30 text-muted-foreground/40"
                    }`}
                    title={`${formatNumber(count)} ${category} risk${count !== 1 ? "s" : ""} at ${level} level`}
                  >
                    {formatNumber(count)}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/60 mt-2">
          {formatNumber(riskHeatMap.totalCategorized)} categorized · {formatNumber(riskHeatMap.totalUncategorized)} uncategorized
        </p>
      </div>

      {/* Upgrade Impact */}
      <div className="bg-card rounded-lg border p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Upgrade Impact
        </h3>
        <div className="space-y-2">
          {Object.entries(upgradeImpact.upgradeStrategyCounts)
            .sort(([a], [b]) => {
              const order: Record<string, number> = { standard_upgrade: 0, needs_revalidation: 1, custom_maintenance: 2 };
              return (order[a] ?? 3) - (order[b] ?? 3);
            })
            .map(([strategy, count]) => (
              <div key={strategy} className="flex items-center justify-between">
                <Badge className={`text-xs ${STRATEGY_COLORS[strategy] ?? "bg-slate-50 text-slate-600"}`}>
                  {STRATEGY_LABELS[strategy] ?? strategy}
                </Badge>
                <span className="text-sm font-medium text-foreground">{formatNumber(count)}</span>
              </div>
            ))}
        </div>
        {upgradeImpact.upgradeUnsafeCount > 0 && (
          <p className="text-xs text-amber-600 mt-2">
            {formatNumber(upgradeImpact.upgradeUnsafeCount)} resolution(s) require custom maintenance during upgrades
          </p>
        )}
      </div>

      {/* Approval Progress */}
      <div className="bg-card rounded-lg border p-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Client Approval
        </h3>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-lg font-bold text-foreground">
            {formatNumber(approvalStatus.approved)} / {formatNumber(approvalStatus.total)}
          </span>
          <span className="text-xs text-muted-foreground">approved</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{ width: `${approvalPercent}%` }}
          />
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          {approvalStatus.pending > 0 && (
            <span>{formatNumber(approvalStatus.pending)} pending approval</span>
          )}
          {approvalStatus.unresolvedCount > 0 && (
            <span className="text-amber-600">{formatNumber(approvalStatus.unresolvedCount)} unresolved</span>
          )}
        </div>
      </div>
    </div>
  );
}
