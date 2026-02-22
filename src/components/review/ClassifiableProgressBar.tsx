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
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="font-medium text-foreground">
          {totalClassified} of {totalClassifiable} classifiable steps reviewed
        </span>
        <span className="text-muted-foreground">
          ({totalSteps} total)
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        {percentage}% complete
      </p>
    </div>
  );
}
