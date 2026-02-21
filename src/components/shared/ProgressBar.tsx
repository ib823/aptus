interface ProgressBarProps {
  value: number;
  max?: number;
  showPercentage?: boolean;
  className?: string;
  label?: string;
}

export function ProgressBar({
  value,
  max = 100,
  showPercentage = false,
  className = "",
  label,
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className={className}>
      {showPercentage && (
        <p className="text-sm text-muted-foreground text-right mb-1">{percentage}%</p>
      )}
      <div className="h-2 rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-blue-500 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-label={label ?? `${percentage}% complete`}
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  );
}
