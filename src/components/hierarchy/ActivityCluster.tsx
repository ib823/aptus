"use client";

import type { ActivityNode } from "@/types/hierarchy";
import { getActivityDescription } from "@/constants/activity-descriptions";

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

/** REM-31: Strip verbose prefixes to show the differentiating part of activity titles */
function smartTruncate(title: string, maxLen: number): string {
  const prefixes = [
    "Additional Information: ",
    "Additional Information:",
    "Preliminary Activities: ",
    "General Settings: ",
    "Company-Specific Settings: ",
  ];
  let cleaned = title;
  for (const prefix of prefixes) {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length).trim();
      cleaned = "\u2139\uFE0F " + cleaned;
      break;
    }
  }
  if (cleaned.length > maxLen) {
    return cleaned.slice(0, maxLen - 1) + "\u2026";
  }
  return cleaned;
}

export function ActivityCluster({ activity, x, y, width, height, onSelect }: ActivityClusterProps) {
  const colors = getStatusColor(activity);
  const pct = activity.stepCount > 0 ? Math.round((activity.reviewedCount / activity.stepCount) * 100) : 0;
  const displayTitle = activity.title === "__main_activity__" ? "Steps" : activity.title;
  const truncTitle = smartTruncate(displayTitle, 28);

  const description = getActivityDescription(displayTitle);
  const ariaLabel = `${displayTitle}: ${activity.classifiableCount ?? activity.stepCount} steps to review, ${activity.reviewedCount} done, ${pct}% complete${description ? `. ${description}` : ""}`;

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
      <title>{`${displayTitle}${description ? `\n${description}` : ""}\n${activity.reviewedCount}/${activity.stepCount} steps reviewed`}</title>
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
      {/* Step count badge — REM-30: show classifiable count */}
      <text
        x={x + 10}
        y={y + 40}
        fontSize={9}
        fill={colors.text}
      >
        {activity.classifiableCount ?? activity.stepCount} to review
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
