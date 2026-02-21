import { UI_TEXT } from "@/constants/ui-text";
import type { AssessmentStatus, FitStatus } from "@/types/assessment";

const statusTokens: Record<string, { bg: string; fg: string }> = {
  FIT: { bg: "var(--status-fit-bg)", fg: "var(--status-fit-fg)" },
  CONFIGURE: { bg: "var(--status-configure-bg)", fg: "var(--status-configure-fg)" },
  EXTEND: { bg: "var(--status-extend-bg)", fg: "var(--status-extend-fg)" },
  BUILD: { bg: "var(--status-build-bg)", fg: "var(--status-build-fg)" },
  ADAPT: { bg: "var(--status-adapt-bg)", fg: "var(--status-adapt-fg)" },
  PENDING: { bg: "var(--status-pending-bg)", fg: "var(--status-pending-fg)" },
  NA: { bg: "var(--status-na-bg)", fg: "var(--status-na-fg)" },
  GAP: { bg: "var(--status-extend-bg)", fg: "var(--status-extend-fg)" },
  // Assessment statuses
  draft: { bg: "var(--status-pending-bg)", fg: "var(--status-pending-fg)" },
  in_progress: { bg: "var(--status-configure-bg)", fg: "var(--status-configure-fg)" },
  completed: { bg: "var(--status-fit-bg)", fg: "var(--status-fit-fg)" },
  reviewed: { bg: "var(--status-adapt-bg)", fg: "var(--status-adapt-fg)" },
  signed_off: { bg: "var(--status-fit-bg)", fg: "var(--status-fit-fg)" },
};

const defaultToken = { bg: "var(--status-pending-bg)", fg: "var(--status-pending-fg)" };

interface StatusBadgeProps {
  status: FitStatus | AssessmentStatus | string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const token = statusTokens[status] ?? defaultToken;
  const label =
    (UI_TEXT.fitStatus as Record<string, string>)[status] ??
    (UI_TEXT.status as Record<string, string>)[status] ??
    status;

  return (
    <span
      className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-medium ${className}`}
      style={{ backgroundColor: token.bg, color: token.fg }}
    >
      {label}
    </span>
  );
}
