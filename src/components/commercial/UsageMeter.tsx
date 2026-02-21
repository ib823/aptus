"use client";

import { Progress } from "@/components/ui/progress";

interface UsageMeterProps {
  label: string;
  current: number;
  limit: number;
}

function getColorClass(pct: number): string {
  if (pct >= 90) return "[&_[data-slot=progress-indicator]]:bg-red-500";
  if (pct >= 75) return "[&_[data-slot=progress-indicator]]:bg-amber-500";
  return "[&_[data-slot=progress-indicator]]:bg-green-500";
}

function formatLimit(n: number): string {
  if (n === Infinity || !Number.isFinite(n)) return "Unlimited";
  return String(n);
}

export function UsageMeter({ label, current, limit }: UsageMeterProps) {
  const pct = limit === Infinity || limit === 0 ? 0 : Math.min(100, Math.round((current / limit) * 100));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {current} / {formatLimit(limit)}
        </span>
      </div>
      <Progress value={pct} className={getColorClass(pct)} />
    </div>
  );
}
