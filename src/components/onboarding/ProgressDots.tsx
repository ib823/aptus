"use client";

interface ProgressDotsProps {
  total: number;
  current: number;
  completed: number[];
  skipped: number[];
}

export function ProgressDots({ total, current, completed, skipped }: ProgressDotsProps) {
  const completedSet = new Set(completed);
  const skippedSet = new Set(skipped);

  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }, (_, index) => {
        const isActive = index === current;
        const isCompleted = completedSet.has(index);
        const isSkipped = skippedSet.has(index);

        let className = "w-2.5 h-2.5 rounded-full transition-all";
        if (isActive) {
          className += " bg-primary w-3 h-3";
        } else if (isCompleted) {
          className += " bg-green-500";
        } else if (isSkipped) {
          className += " bg-gray-300";
        } else {
          className += " bg-muted-foreground/20";
        }

        return <div key={index} className={className} />;
      })}
    </div>
  );
}
