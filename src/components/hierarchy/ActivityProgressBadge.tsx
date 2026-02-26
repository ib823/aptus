"use client";

interface ActivityProgressBadgeProps {
  reviewed: number;
  total: number;
  gapCount?: number;
}

function getStatusColor(reviewed: number, total: number, gapCount: number): string {
  if (total === 0) return "bg-gray-100 text-gray-600";
  if (gapCount > 0) return "bg-amber-100 text-amber-700";
  if (reviewed === total) return "bg-green-100 text-green-700";
  if (reviewed > 0) return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

export function ActivityProgressBadge({ reviewed, total, gapCount = 0 }: ActivityProgressBadgeProps) {
  const color = getStatusColor(reviewed, total, gapCount);

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}>
      {reviewed}/{total}
    </span>
  );
}
