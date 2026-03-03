"use client";

import { useState } from "react";
import { AlertTriangle, GitBranch, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DependencyEffects } from "@/lib/dependency/types";

interface DependencyEffectsPanelProps {
  effects: DependencyEffects;
}

/**
 * Panel displayed after a classification triggers dependency propagation.
 * Shows auto-NA propagations, warnings, and undo controls.
 */
export function DependencyEffectsPanel({
  effects,
}: DependencyEffectsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const hasPropagations = effects.propagations.length > 0;
  const hasWarnings = effects.warnings.length > 0;
  const hasReversed = effects.reversed && effects.reversed.undoneSteps.length > 0;

  if (!hasPropagations && !hasWarnings && !hasReversed) return null;

  const totalAffectedSteps = effects.propagations.reduce(
    (sum, p) => sum + p.stepCount,
    0,
  );

  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-violet-50 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-violet-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-violet-500" />
        )}
        <GitBranch className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-medium text-violet-700">
          Dependency Effects
        </span>
        {hasPropagations && (
          <Badge className="text-[10px] bg-violet-100 text-violet-600 border-violet-200 ml-auto">
            {totalAffectedSteps} step{totalAffectedSteps !== 1 ? "s" : ""} auto-classified
          </Badge>
        )}
        {hasWarnings && (
          <Badge className="text-[10px] bg-amber-100 text-amber-600 border-amber-200">
            {effects.warnings.length} warning{effects.warnings.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-3">
          {/* Propagations */}
          {hasPropagations && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-violet-600 uppercase tracking-wider">
                Auto-Propagated as Not Relevant
              </p>
              {effects.propagations.map((p, i) => (
                <div
                  key={`prop-${i}`}
                  className="flex items-start gap-2 p-2 bg-white/60 rounded border border-violet-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate" title={p.activityTitle}>
                      {p.activityTitle}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.stepCount} step{p.stepCount !== 1 ? "s" : ""} &middot;{" "}
                      {p.businessReason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {hasWarnings && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">
                Advisory Warnings
              </p>
              {effects.warnings.map((w, i) => (
                <div
                  key={`warn-${i}`}
                  className="flex items-start gap-2 p-2 bg-amber-50/50 rounded border border-amber-100"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate" title={w.activityTitle || w.activityId}>
                      {w.activityTitle || w.activityId}
                      {w.warningType === "WARN_CROSS_SCOPE" && (
                        <Badge
                          variant="outline"
                          className="ml-2 text-[10px] text-amber-500 border-amber-200"
                        >
                          Cross-scope ({w.scopeItemCode})
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {w.businessReason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Reversed propagations */}
          {hasReversed && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-green-600 uppercase tracking-wider">
                Reversed Propagations
              </p>
              <div className="p-2 bg-green-50/50 rounded border border-green-100">
                <p className="text-xs text-green-700">
                  {effects.reversed!.undoneSteps.length} step{effects.reversed!.undoneSteps.length !== 1 ? "s" : ""} restored to their previous classification.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
