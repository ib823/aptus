"use client";

interface GapCostSummaryProps {
  totalOneTimeCost: number;
  totalRecurringCost: number;
  totalImplementationDays: number;
  byType: Record<string, number>;
  byRiskCategory: Record<string, number>;
}

function formatCurrency(value: number): string {
  if (value === 0) return "$0";
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function GapCostSummary({
  totalOneTimeCost,
  totalRecurringCost,
  totalImplementationDays,
  byType,
  byRiskCategory,
}: GapCostSummaryProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalOneTimeCost)}</p>
          <p className="text-xs text-muted-foreground">One-Time Cost</p>
        </div>
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-xl font-bold text-foreground">{formatCurrency(totalRecurringCost)}</p>
          <p className="text-xs text-muted-foreground">Annual Recurring</p>
        </div>
        <div className="bg-card rounded-lg border p-3 text-center">
          <p className="text-xl font-bold text-foreground">{totalImplementationDays}</p>
          <p className="text-xs text-muted-foreground">Effort Days</p>
        </div>
      </div>

      {/* Resolution type breakdown */}
      {Object.keys(byType).length > 0 && (
        <div className="bg-card rounded-lg border p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            By Resolution Type
          </p>
          <div className="space-y-1">
            {Object.entries(byType)
              .filter(([type]) => type !== "PENDING")
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{type}</span>
                  <span className="font-medium text-foreground">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Risk category breakdown */}
      {Object.keys(byRiskCategory).length > 0 && (
        <div className="bg-card rounded-lg border p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            By Risk Category
          </p>
          <div className="space-y-1">
            {Object.entries(byRiskCategory).map(([category, count]) => (
              <div key={category} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{category}</span>
                <span className="font-medium text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
