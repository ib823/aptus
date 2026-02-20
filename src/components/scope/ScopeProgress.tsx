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
          <span className="font-semibold text-gray-950">{selectedCount}</span>
          <span className="text-gray-500"> / {totalCount} selected</span>
        </div>
        <div className="text-gray-300">|</div>
        <div>
          <span className="font-semibold text-gray-950">{totalStepsInScope}</span>
          <span className="text-gray-500"> steps to review</span>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="w-32 h-1.5 rounded-full bg-gray-200">
          <div
            className="h-1.5 rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${respondedPercent}%` }}
          />
        </div>
        <span className="text-xs text-gray-500">{respondedPercent}% responded</span>
      </div>
    </div>
  );
}
