"use client";

import type { AssessmentStatusV2 } from "@/types/assessment";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/assessment/status-machine";

const COLOR_CLASSES: Record<string, string> = {
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  lime: "bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-300",
  cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

interface AssessmentStatusBadgeProps {
  status: string;
}

export function AssessmentStatusBadge({ status }: AssessmentStatusBadgeProps) {
  const statusKey = status as AssessmentStatusV2;
  const label = STATUS_LABELS[statusKey] ?? status;
  const colorName = STATUS_COLORS[statusKey] ?? "gray";
  const colorClass = COLOR_CLASSES[colorName] ?? COLOR_CLASSES.gray;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  );
}
