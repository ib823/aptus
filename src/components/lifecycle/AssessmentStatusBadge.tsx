"use client";

import type { AssessmentStatusV2 } from "@/types/assessment";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/assessment/status-machine";

const COLOR_CLASSES: Record<string, string> = {
  gray: "bg-slate-50 text-slate-700",
  blue: "bg-blue-50 text-blue-700",
  indigo: "bg-indigo-50 text-indigo-700",
  purple: "bg-purple-50 text-purple-700",
  amber: "bg-amber-50 text-amber-700",
  orange: "bg-orange-50 text-orange-700",
  yellow: "bg-yellow-50 text-yellow-700",
  lime: "bg-lime-50 text-lime-700",
  cyan: "bg-cyan-50 text-cyan-700",
  green: "bg-green-50 text-green-700",
  teal: "bg-teal-50 text-teal-700",
  slate: "bg-slate-50 text-slate-700",
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
