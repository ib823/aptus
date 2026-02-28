"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { ActivityProgressBadge } from "./ActivityProgressBadge";
import type { HierarchyTree, ActivityProgressMap } from "@/types/hierarchy";

interface HierarchyTreeSidebarProps {
  tree: HierarchyTree;
  currentActivityId: string | null;
  progressMap: ActivityProgressMap | null;
  onActivitySelect: (activityId: string) => void;
}

function getActivityStatusColor(
  reviewed: number,
  total: number,
  gapCount: number,
): string {
  if (total === 0) return "text-slate-300";
  if (gapCount > 0) return "text-amber-500";
  if (reviewed === total) return "text-green-500";
  if (reviewed > 0) return "text-blue-500";
  return "text-slate-300";
}

export function HierarchyTreeSidebar({
  tree,
  currentActivityId,
  progressMap,
  onActivitySelect,
}: HierarchyTreeSidebarProps) {
  const [expandedProcesses, setExpandedProcesses] = useState<Set<string>>(() => {
    // Expand the process containing the current activity by default
    const set = new Set<string>();
    for (const p of tree.processes) {
      set.add(p.id);
    }
    return set;
  });
  const [expandedFlows, setExpandedFlows] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const p of tree.processes) {
      for (const f of p.flows) {
        set.add(f.id);
      }
    }
    return set;
  });

  const treeRef = useRef<HTMLDivElement>(null);

  const toggleProcess = useCallback((id: string) => {
    setExpandedProcesses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleFlow = useCallback((id: string) => {
    setExpandedFlows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const el = treeRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = Array.from(el.querySelectorAll<HTMLElement>("[role='treeitem']"));
      const focused = document.activeElement as HTMLElement;
      const idx = items.indexOf(focused);
      if (idx === -1) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          items[idx + 1]?.focus();
          break;
        case "ArrowUp":
          e.preventDefault();
          items[idx - 1]?.focus();
          break;
        case "ArrowRight": {
          e.preventDefault();
          const level = focused.getAttribute("aria-level");
          if (level === "1") {
            const id = focused.dataset.processId;
            if (id && !expandedProcesses.has(id)) toggleProcess(id);
          } else if (level === "2") {
            const id = focused.dataset.flowId;
            if (id && !expandedFlows.has(id)) toggleFlow(id);
          }
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const level = focused.getAttribute("aria-level");
          if (level === "1") {
            const id = focused.dataset.processId;
            if (id && expandedProcesses.has(id)) toggleProcess(id);
          } else if (level === "2") {
            const id = focused.dataset.flowId;
            if (id && expandedFlows.has(id)) toggleFlow(id);
          }
          break;
        }
        case "Enter": {
          e.preventDefault();
          focused.click();
          break;
        }
      }
    };

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
  }, [expandedProcesses, expandedFlows, toggleProcess, toggleFlow]);

  return (
    <div ref={treeRef} role="tree" aria-label="Process hierarchy" className="py-2 text-xs">
      {tree.processes.map((process) => {
        const displayName = process.name === "__main_process__" ? "Main Process" : process.name;
        const processExpanded = expandedProcesses.has(process.id);

        return (
          <div key={process.id}>
            {/* Level 1: Process */}
            <div
              role="treeitem"
              aria-level={1}
              aria-expanded={processExpanded}
              aria-selected={false}
              tabIndex={0}
              data-process-id={process.id}
              onClick={() => toggleProcess(process.id)}
              className="flex items-center gap-1 px-3 py-1.5 cursor-pointer hover:bg-slate-50 transition-colors"
            >
              {processExpanded ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
              )}
              <span className="font-medium text-foreground truncate" title={displayName}>
                {displayName}
              </span>
            </div>

            {processExpanded && process.flows.map((flow) => {
              const flowDisplayName = flow.name === "__main_flow__" ? "Main Flow" : flow.name;
              const flowExpanded = expandedFlows.has(flow.id);

              return (
                <div key={flow.id}>
                  {/* Level 2: Flow */}
                  <div
                    role="treeitem"
                    aria-level={2}
                    aria-expanded={flowExpanded}
                    aria-selected={false}
                    tabIndex={0}
                    data-flow-id={flow.id}
                    onClick={() => toggleFlow(flow.id)}
                    className="flex items-center gap-1 pl-5 pr-3 py-1.5 cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    {flowExpanded ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-muted-foreground truncate" title={flowDisplayName}>
                      {flowDisplayName}
                    </span>
                  </div>

                  {flowExpanded && flow.activities.map((activity) => {
                    const progress = progressMap?.[activity.id];
                    const reviewed = progress?.reviewed ?? activity.reviewedCount;
                    const total = progress?.total ?? activity.stepCount;
                    const gaps = progress?.gap ?? activity.gapCount;
                    const isSelected = currentActivityId === activity.id;
                    const statusColor = getActivityStatusColor(reviewed, total, gaps);
                    const displayTitle = activity.title === "__main_activity__" ? "Steps" : activity.title;

                    return (
                      <div
                        key={activity.id}
                        role="treeitem"
                        aria-level={3}
                        aria-selected={isSelected}
                        tabIndex={0}
                        onClick={() => onActivitySelect(activity.id)}
                        className={`flex items-center gap-2 pl-7 pr-3 py-1.5 cursor-pointer transition-colors min-h-[44px] ${
                          isSelected
                            ? "bg-blue-50 text-blue-600 border-l-2 border-blue-500"
                            : "text-foreground hover:bg-slate-50 border-l-2 border-transparent"
                        }`}
                      >
                        <span className="text-muted-foreground/40 shrink-0">↳</span>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} />
                        <span className="truncate flex-1" title={displayTitle}>
                          {displayTitle}
                        </span>
                        <ActivityProgressBadge reviewed={reviewed} total={total} gapCount={gaps} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
