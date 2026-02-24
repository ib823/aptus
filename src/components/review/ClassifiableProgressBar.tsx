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
  const label = `${totalClassified} of ${totalClassifiable} classifiable ${totalClassifiable === 1 ? "step" : "steps"} reviewed`;
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
      <p className="text-xs text-muted-foreground mt-1">
        {percentage}% complete
      </p>
    </div>
  );
}
