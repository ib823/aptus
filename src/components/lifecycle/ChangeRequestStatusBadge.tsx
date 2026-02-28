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
    className: "bg-yellow-50 text-yellow-700",
  },
  APPROVED: {
    label: "Approved",
    className: "bg-green-50 text-green-700",
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-red-50 text-red-700",
  },
  IN_PROGRESS: {
    label: "In Progress",
    className: "bg-blue-50 text-blue-700",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-teal-50 text-teal-700",
  },
};

export function ChangeRequestStatusBadge({ status, className }: ChangeRequestStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? { label: status, className: "bg-slate-50 text-slate-700" };

  return (
    <Badge variant="outline" className={cn("border-transparent", style.className, className)}>
      {style.label}
    </Badge>
  );
}
