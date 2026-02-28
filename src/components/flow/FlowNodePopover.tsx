"use client";

import { Badge } from "@/components/ui/badge";
import type { FlowNode, RiskOverlayEntry } from "@/types/flow";

interface FlowNodePopoverProps {
  node: FlowNode;
  riskEntry?: RiskOverlayEntry | undefined;
  onClose: () => void;
  assessmentId: string;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  FIT: { label: "FIT", className: "bg-green-50 text-green-700 border border-green-200" },
  CONFIGURE: { label: "CONFIGURE", className: "bg-blue-50 text-blue-700 border border-blue-200" },
  GAP: { label: "GAP", className: "bg-amber-50 text-amber-700 border border-amber-200" },
  NA: { label: "N/A", className: "bg-slate-50 text-slate-500 border border-slate-200" },
  PENDING: { label: "PENDING", className: "bg-gray-50 text-gray-500 border border-gray-200" },
};

export function FlowNodePopover({ node, riskEntry, onClose, assessmentId }: FlowNodePopoverProps) {
  const badge = STATUS_BADGES[node.fitStatus] ?? { label: node.fitStatus, className: "bg-gray-100 text-gray-500" };

  return (
    <div
      className="absolute z-50 bg-card border rounded-lg shadow-lg p-4 w-72"
      style={{
        left: node.position.x + node.width + 8,
        top: node.position.y,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs text-muted-foreground">Step {node.stepSequence + 1}</span>
          <h4 className="text-sm font-semibold mt-0.5">{node.actionTitle}</h4>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground text-xs"
          aria-label="Close popover"
        >
          &times;
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Badge className={badge.className}>{badge.label}</Badge>
        {riskEntry && riskEntry.riskScore > 0 && (
          <span className="text-xs text-muted-foreground">
            Risk: {Math.round(riskEntry.riskScore * 100)}%
          </span>
        )}
      </div>

      {node.clientNote && (
        <div className="mt-3">
          <span className="text-xs text-muted-foreground">Client Note</span>
          <p className="text-sm mt-1 text-muted-foreground bg-muted/40 p-2 rounded">
            {node.clientNote}
          </p>
        </div>
      )}

      <a
        href={`/assessment/${assessmentId}/review?step=${node.processStepId}`}
        className="mt-3 block text-xs text-blue-500 hover:text-blue-600"
      >
        View Step Detail &rarr;
      </a>
    </div>
  );
}
