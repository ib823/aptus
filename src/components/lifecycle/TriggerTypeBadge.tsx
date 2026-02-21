"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReassessmentTriggerType } from "@/types/lifecycle";

interface TriggerTypeBadgeProps {
  triggerType: ReassessmentTriggerType | string;
  className?: string | undefined;
}

const TYPE_STYLES: Record<string, { label: string; className: string }> = {
  SAP_UPDATE: {
    label: "SAP Update",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  REGULATORY_CHANGE: {
    label: "Regulatory",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  },
  ORG_CHANGE: {
    label: "Org Change",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  },
  SCOPE_DRIFT: {
    label: "Scope Drift",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  MANUAL: {
    label: "Manual",
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  },
};

export function TriggerTypeBadge({ triggerType, className }: TriggerTypeBadgeProps) {
  const style = TYPE_STYLES[triggerType] ?? { label: triggerType, className: "bg-gray-100 text-gray-700" };

  return (
    <Badge variant="outline" className={cn("border-transparent", style.className, className)}>
      {style.label}
    </Badge>
  );
}
