"use client";

interface ActivityProgressBadgeProps {
  reviewed: number;
  total: number;
  gapCount?: number;
}

function getStatusColor(reviewed: number, total: number, gapCount: number): string {
  if (total === 0) return "bg-slate-50 text-slate-600";
  if (gapCount > 0) return "bg-amber-50 text-amber-700";
  if (reviewed === total) return "bg-green-50 text-green-700";
  if (reviewed > 0) return "bg-blue-50 text-blue-700";
  return "bg-slate-50 text-slate-600";
}

export function ActivityProgressBadge({ reviewed, total, gapCount = 0 }: ActivityProgressBadgeProps) {
  const color = getStatusColor(reviewed, total, gapCount);

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>
      {reviewed}/{total}
    </span>
  );
}
