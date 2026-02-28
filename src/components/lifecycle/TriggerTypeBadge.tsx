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
    className: "bg-blue-50 text-blue-700",
  },
  REGULATORY_CHANGE: {
    label: "Regulatory",
    className: "bg-purple-50 text-purple-700",
  },
  ORG_CHANGE: {
    label: "Org Change",
    className: "bg-orange-50 text-orange-700",
  },
  SCOPE_DRIFT: {
    label: "Scope Drift",
    className: "bg-amber-50 text-amber-700",
  },
  MANUAL: {
    label: "Manual",
    className: "bg-slate-50 text-slate-700",
  },
};

export function TriggerTypeBadge({ triggerType, className }: TriggerTypeBadgeProps) {
  const style = TYPE_STYLES[triggerType] ?? { label: triggerType, className: "bg-slate-50 text-slate-700" };

  return (
    <Badge variant="outline" className={cn("border-transparent", style.className, className)}>
      {style.label}
    </Badge>
  );
}
