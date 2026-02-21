"use client";

import type { ProfileCompletenessBreakdown } from "@/types/assessment";
import { PROFILE_COMPLETENESS_GATE } from "@/types/assessment";

interface ProfileCompletenessBarProps {
  score: number;
  breakdown: ProfileCompletenessBreakdown;
}

const SECTION_LABELS: Record<keyof ProfileCompletenessBreakdown, string> = {
  basic: "Basic Info",
  financial: "Financial",
  sapStrategy: "SAP Strategy",
  operational: "Operational",
  itLandscape: "IT Landscape",
};

export function ProfileCompletenessBar({ score, breakdown }: ProfileCompletenessBarProps) {
  const barColor =
    score >= PROFILE_COMPLETENESS_GATE
      ? "bg-green-500"
      : score >= 40
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-foreground">{score}% complete</span>
        <span className="text-xs text-muted-foreground">
          {PROFILE_COMPLETENESS_GATE}% required to proceed
        </span>
      </div>
      <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {(Object.entries(breakdown) as [keyof ProfileCompletenessBreakdown, boolean][]).map(
          ([key, done]) => (
            <span
              key={key}
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${
                done
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-muted text-muted-foreground border"
              }`}
            >
              {done ? "\u2713" : "\u25CB"} {SECTION_LABELS[key]}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
