"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PropagatedStepBadgeProps {
  businessReason?: string;
}

/**
 * Visual indicator for steps that were auto-classified as NA
 * by the dependency propagation engine.
 */
export function PropagatedStepBadge({ businessReason }: PropagatedStepBadgeProps) {
  const badge = (
    <Badge
      variant="outline"
      className="text-[10px] bg-violet-50 text-violet-600 border-violet-200 shrink-0"
    >
      Auto-NA
    </Badge>
  );

  if (!businessReason) return badge;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium mb-1">Auto-propagated as Not Relevant</p>
          <p className="text-muted-foreground">{businessReason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
