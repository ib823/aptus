"use client";

interface ClassifiableProgressBarProps {
  totalClassifiable: number;
  totalClassified: number;
  totalSteps: number;
  percentage: number;
}

export function ClassifiableProgressBar({
  totalClassifiable,
  totalClassified,
  totalSteps,
  percentage,
}: ClassifiableProgressBarProps) {
  const label = `${totalClassified} of ${totalClassifiable} ${totalClassifiable === 1 ? "step" : "steps"} reviewed`;
  const remainingSteps = totalClassifiable - totalClassified;
  const estimatedMinutes = Math.ceil(remainingSteps * 1);
  const hours = Math.floor(estimatedMinutes / 60);
  const mins = estimatedMinutes % 60;
  const timeLabel = hours > 0
    ? `~${hours}h ${mins}m remaining`
    : `~${mins} minutes remaining`;

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="font-medium text-foreground">
          {label}
        </span>
        <span className="text-muted-foreground">
          ({totalSteps} total)
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-label={label}
          aria-valuenow={totalClassified}
          aria-valuemin={0}
          aria-valuemax={totalClassifiable}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-muted-foreground">
          {percentage}% complete
        </p>
        {remainingSteps > 0 && (
          <p className="text-xs text-muted-foreground">
            {timeLabel} at ~1 min/step
          </p>
        )}
      </div>
    </div>
  );
}
