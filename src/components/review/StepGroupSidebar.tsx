"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, memo } from "react";
import { getStepCategoryColor } from "@/lib/assessment/step-classifier";
import type { StepGroup } from "@/lib/assessment/step-grouper";

interface StepGroupSidebarProps {
  groups: StepGroup[];
  activeGroupKey: string | null;
  activeStepId: string | null;
  onGroupClick: (groupKey: string) => void;
  onStepClick: (stepId: string) => void;
}

export const StepGroupSidebar = memo(function StepGroupSidebar({
  groups,
  activeGroupKey,
  activeStepId,
  onGroupClick,
  onStepClick,
}: StepGroupSidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(activeGroupKey ? [activeGroupKey] : groups.length > 0 ? [groups[0]!.key] : []),
  );

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    onGroupClick(key);
  };

  return (
    <div className="space-y-0.5">
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.key);
        const reviewed = group.steps.filter((s) => s.isClassifiable && s.fitStatus !== "PENDING").length;
        const colorClass = getStepCategoryColor(group.category);

        return (
          <div key={group.key}>
            <button
              onClick={() => toggleGroup(group.key)}
              aria-expanded={isExpanded}
              aria-label={`${group.label} — ${group.classifiableCount > 0 ? `${reviewed} of ${group.classifiableCount} reviewed` : `${group.steps.length} steps`}`}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors rounded-md ${
                activeGroupKey === group.key ? "bg-accent" : "hover:bg-accent/50"
              }`}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              )}
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${colorClass}`}>
                {group.classifiableCount > 0 ? `${reviewed}/${group.classifiableCount}` : group.steps.length}
              </span>
              <span className="text-sm font-medium text-foreground truncate" title={group.label}>
                {group.label}
              </span>
            </button>

            {isExpanded && (
              <div className="ml-5 border-l pl-2 space-y-0.5">
                {group.steps.map((step) => {
                  const dotColor = step.fitStatus === "FIT" ? "bg-green-500"
                    : step.fitStatus === "CONFIGURE" ? "bg-blue-500"
                    : step.fitStatus === "GAP" ? "bg-amber-500"
                    : step.fitStatus === "NA" ? "bg-slate-300"
                    : "bg-slate-200";

                  return (
                    <button
                      key={step.id}
                      onClick={() => onStepClick(step.id)}
                      aria-label={`Step ${step.sequence + 1}: ${step.actionTitle} — ${step.fitStatus === "PENDING" ? "unreviewed" : step.fitStatus}`}
                      aria-current={activeStepId === step.id ? "step" : undefined}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors rounded ${
                        activeStepId === step.id
                          ? "bg-blue-50 border-l-2 border-blue-500"
                          : "hover:bg-accent/50 border-l-2 border-transparent"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                      <span
                        className={`text-xs truncate ${step.isClassifiable ? "text-foreground" : "text-muted-foreground"}`}
                        title={`${step.sequence + 1}. ${step.actionTitle}`}
                      >
                        {step.sequence + 1}. {step.actionTitle}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
