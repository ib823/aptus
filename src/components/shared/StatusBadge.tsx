import { UI_TEXT } from "@/constants/ui-text";
import type { AssessmentStatus, FitStatus } from "@/types/assessment";

const statusStyles: Record<string, string> = {
  FIT: "bg-green-100 text-green-700",
  CONFIGURE: "bg-blue-100 text-blue-700",
  EXTEND: "bg-amber-100 text-amber-700",
  BUILD: "bg-red-100 text-red-700",
  ADAPT: "bg-purple-100 text-purple-700",
  PENDING: "bg-gray-100 text-gray-600",
  NA: "bg-gray-100 text-gray-400",
  GAP: "bg-amber-100 text-amber-700",
  // Assessment statuses
  draft: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  reviewed: "bg-purple-100 text-purple-700",
  signed_off: "bg-green-100 text-green-700",
};

interface StatusBadgeProps {
  status: FitStatus | AssessmentStatus | string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const style = statusStyles[status] ?? "bg-gray-100 text-gray-600";
  const label =
    (UI_TEXT.fitStatus as Record<string, string>)[status] ??
    (UI_TEXT.status as Record<string, string>)[status] ??
    status;

  return (
    <span
      className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium ${style} ${className}`}
    >
      {label}
    </span>
  );
}
