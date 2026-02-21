"use client";

import { Badge } from "@/components/ui/badge";

interface WorkshopStepCardProps {
  stepTitle: string;
  stepSequence: number;
  scopeItemName?: string | undefined;
  processFlowName?: string | undefined;
  instructions?: string | undefined;
  currentStatus?: string | undefined;
}

const STATUS_BADGE: Record<string, string> = {
  FIT: "bg-green-100 text-green-700",
  CONFIGURE: "bg-blue-100 text-blue-700",
  GAP: "bg-amber-100 text-amber-700",
  NA: "bg-gray-100 text-gray-600",
  PENDING: "bg-gray-50 text-gray-500",
};

export function WorkshopStepCard({
  stepTitle,
  stepSequence,
  scopeItemName,
  processFlowName,
  instructions,
  currentStatus,
}: WorkshopStepCardProps) {
  return (
    <div className="bg-card border rounded-xl p-6 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            Step {stepSequence}
          </div>
          <h2 className="text-xl font-bold text-foreground">{stepTitle}</h2>
        </div>
        {currentStatus && (
          <Badge className={STATUS_BADGE[currentStatus] ?? STATUS_BADGE.PENDING}>
            {currentStatus}
          </Badge>
        )}
      </div>
      {(scopeItemName ?? processFlowName) && (
        <div className="text-sm text-muted-foreground mb-3">
          {scopeItemName && <span>{scopeItemName}</span>}
          {scopeItemName && processFlowName && <span> / </span>}
          {processFlowName && <span>{processFlowName}</span>}
        </div>
      )}
      {instructions && (
        <div className="text-sm text-foreground/80 bg-muted/30 rounded-lg p-3 mt-3 max-h-32 overflow-y-auto">
          {instructions}
        </div>
      )}
    </div>
  );
}
