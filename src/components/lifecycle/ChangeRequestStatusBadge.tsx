"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ChangeRequestStatus } from "@/types/lifecycle";

interface ChangeRequestStatusBadgeProps {
  status: ChangeRequestStatus | string;
  className?: string | undefined;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  REQUESTED: {
    label: "Requested",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  },
  APPROVED: {
    label: "Approved",
    className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
  IN_PROGRESS: {
    label: "In Progress",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  },
};

export function ChangeRequestStatusBadge({ status, className }: ChangeRequestStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? { label: status, className: "bg-gray-100 text-gray-700" };

  return (
    <Badge variant="outline" className={cn("border-transparent", style.className, className)}>
      {style.label}
    </Badge>
  );
}
