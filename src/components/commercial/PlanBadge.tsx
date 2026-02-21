"use client";

import { Badge } from "@/components/ui/badge";
import type { PlanTier } from "@/types/commercial";

interface PlanBadgeProps {
  plan: PlanTier;
}

const PLAN_STYLES: Record<PlanTier, string> = {
  TRIAL: "bg-gray-100 text-gray-700 border-gray-300",
  STARTER: "bg-blue-100 text-blue-700 border-blue-300",
  PROFESSIONAL: "bg-purple-100 text-purple-700 border-purple-300",
  ENTERPRISE: "bg-amber-100 text-amber-700 border-amber-300",
};

export function PlanBadge({ plan }: PlanBadgeProps) {
  return (
    <Badge variant="outline" className={PLAN_STYLES[plan]}>
      {plan}
    </Badge>
  );
}
