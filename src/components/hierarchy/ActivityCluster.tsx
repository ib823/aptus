"use client";

import type { ActivityNode } from "@/types/hierarchy";

interface ActivityClusterProps {
  activity: ActivityNode;
  x: number;
  y: number;
  width: number;
  height: number;
  onSelect: (activityId: string) => void;
}

function getStatusColor(activity: ActivityNode): { bg: string; border: string; text: string } {
  if (activity.stepCount === 0) return { bg: "#f3f4f6", border: "#d1d5db", text: "#6b7280" };
  if (activity.gapCount > 0) return { bg: "#fef3c7", border: "#f59e0b", text: "#b45309" };
  if (activity.reviewedCount === activity.stepCount) return { bg: "#dcfce7", border: "#22c55e", text: "#15803d" };
  if (activity.reviewedCount > 0) return { bg: "#dbeafe", border: "#3b82f6", text: "#1d4ed8" };
  return { bg: "#f3f4f6", border: "#d1d5db", text: "#6b7280" };
}

export function ActivityCluster({ activity, x, y, width, height, onSelect }: ActivityClusterProps) {
  const colors = getStatusColor(activity);
  const pct = activity.stepCount > 0 ? Math.round((activity.reviewedCount / activity.stepCount) * 100) : 0;
  const displayTitle = activity.title === "__main_activity__" ? "Steps" : activity.title;
  const truncTitle = displayTitle.length > 24 ? displayTitle.slice(0, 23) + "…" : displayTitle;

  const ariaLabel = `${displayTitle}: ${activity.reviewedCount} of ${activity.stepCount} steps reviewed, ${pct}% complete`;

  return (
    <g
      role="button"
      aria-label={ariaLabel}
      tabIndex={0}
      onClick={() => onSelect(activity.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(activity.id); } }}
      className="cursor-pointer"
      style={{ outline: "none" }}
    >
      {/* Background rect */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={8}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={2}
      />
      {/* Title */}
      <text
        x={x + 10}
        y={y + 22}
        fontSize={11}
        fontWeight="600"
        fill="#111827"
      >
        {truncTitle}
      </text>
      {/* Step count badge */}
      <text
        x={x + 10}
        y={y + 40}
        fontSize={9}
        fill={colors.text}
      >
        {activity.stepCount} steps
      </text>
      {/* Progress */}
      <text
        x={x + width - 10}
        y={y + 40}
        fontSize={9}
        fill={colors.text}
        textAnchor="end"
      >
        {pct}%
      </text>
      {/* Progress bar */}
      <rect x={x + 10} y={y + height - 12} width={width - 20} height={4} rx={2} fill="#e5e7eb" />
      <rect x={x + 10} y={y + height - 12} width={Math.max(0, (width - 20) * pct / 100)} height={4} rx={2} fill={colors.border} />
    </g>
  );
}
