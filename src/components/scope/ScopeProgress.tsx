interface ScopeProgressProps {
  selectedCount: number;
  totalCount: number;
  totalStepsInScope: number;
  respondedCount: number;
}

export function ScopeProgress({
  selectedCount,
  totalCount,
  totalStepsInScope,
  respondedCount,
}: ScopeProgressProps) {
  const respondedPercent = totalCount > 0 ? Math.round((respondedCount / totalCount) * 100) : 0;

  return (
    <div className="text-right">
      <div className="flex items-center gap-4 text-sm">
        <div>
          <span className="font-semibold text-foreground">{selectedCount}</span>
          <span className="text-muted-foreground"> / {totalCount} selected</span>
        </div>
        <div className="text-muted-foreground/60">|</div>
        <div>
          <span className="font-semibold text-foreground">{totalStepsInScope}</span>
          <span className="text-muted-foreground"> steps to review</span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="w-32 h-1.5 rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${respondedPercent}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{respondedPercent}% responded</span>
      </div>
    </div>
  );
}
