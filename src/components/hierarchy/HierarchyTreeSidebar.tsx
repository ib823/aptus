"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { ActivityProgressBadge } from "./ActivityProgressBadge";
import { findChainsForScopeItem } from "@/constants/process-chains";
import type { HierarchyTree, ActivityProgressMap, ProcessNode, FlowNode } from "@/types/hierarchy";

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

/** Aggregate progress for a flow or process level */
interface AggregateProgress {
  reviewed: number;
  total: number;
  gaps: number;
}

function computeFlowProgress(
  flow: FlowNode,
  progressMap: ActivityProgressMap | null,
): AggregateProgress {
  let reviewed = 0;
  let total = 0;
  let gaps = 0;
  for (const a of flow.activities) {
    const p = progressMap?.[a.id];
    reviewed += p?.reviewed ?? a.reviewedCount;
    total += p?.total ?? a.stepCount;
    gaps += p?.gap ?? a.gapCount;
  }
  return { reviewed, total, gaps };
}

function computeProcessProgress(
  process: ProcessNode,
  progressMap: ActivityProgressMap | null,
): AggregateProgress {
  let reviewed = 0;
  let total = 0;
  let gaps = 0;
  for (const f of process.flows) {
    const fp = computeFlowProgress(f, progressMap);
    reviewed += fp.reviewed;
    total += fp.total;
    gaps += fp.gaps;
  }
  return { reviewed, total, gaps };
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

  // Precompute aggregate progress for processes and flows
  const processProgressMap = useMemo(() => {
    const map = new Map<string, AggregateProgress>();
    for (const p of tree.processes) {
      map.set(p.id, computeProcessProgress(p, progressMap));
    }
    return map;
  }, [tree.processes, progressMap]);

  const flowProgressMap = useMemo(() => {
    const map = new Map<string, AggregateProgress>();
    for (const p of tree.processes) {
      for (const f of p.flows) {
        map.set(f.id, computeFlowProgress(f, progressMap));
      }
    }
    return map;
  }, [tree.processes, progressMap]);

  const chainMemberships = useMemo(
    () => findChainsForScopeItem(tree.scopeItemId),
    [tree.scopeItemId],
  );

  return (
    <div ref={treeRef} role="tree" aria-label="Process hierarchy" className="py-2 text-xs">
      {chainMemberships.length > 0 && (
        <div className="mx-3 mb-3">
          {chainMemberships.map(({ area, chain }) => (
            <div
              key={chain.key}
              className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs mb-1.5 last:mb-0"
            >
              <div className="flex items-center gap-1.5 text-blue-700 font-medium">
                <span className="shrink-0">{"\uD83D\uDD17"}</span>
                <span>Part of: {chain.name} ({chain.abbreviation})</span>
              </div>
              <div className="text-blue-600/70 text-[10px] mt-0.5 truncate" title={`${area} \u2192 ${chain.steps.map((s) => s.businessName).join(" \u2192 ")}`}>
                {area} &rarr; {chain.steps.map((s) => s.businessName).join(" \u2192 ")}
              </div>
            </div>
          ))}
        </div>
      )}
      {tree.processes.map((process) => {
        const displayName = process.name === "__main_process__" ? "Main Process" : process.name;
        const processExpanded = expandedProcesses.has(process.id);
        const procProg = processProgressMap.get(process.id);
        const procPct = procProg && procProg.total > 0
          ? Math.round((procProg.reviewed / procProg.total) * 100)
          : 0;

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
              <span className="font-medium text-foreground truncate flex-1" title={displayName}>
                {displayName}
              </span>
              {procProg && procProg.total > 0 && (
                <span className={`text-[10px] font-medium shrink-0 ${
                  procPct === 100 ? "text-green-600"
                  : procProg.gaps > 0 ? "text-amber-600"
                  : procPct > 0 ? "text-blue-600"
                  : "text-muted-foreground/50"
                }`}>
                  {procPct}%
                </span>
              )}
            </div>

            {processExpanded && process.flows.map((flow) => {
              const flowDisplayName = flow.name === "__main_flow__" ? "Main Flow" : flow.name;
              const flowExpanded = expandedFlows.has(flow.id);
              const flowProg = flowProgressMap.get(flow.id);
              const flowPct = flowProg && flowProg.total > 0
                ? Math.round((flowProg.reviewed / flowProg.total) * 100)
                : 0;

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
                    <span className="text-muted-foreground truncate flex-1" title={flowDisplayName}>
                      {flowDisplayName}
                    </span>
                    {flowProg && flowProg.total > 0 && (
                      <span className={`text-[10px] font-medium shrink-0 ${
                        flowPct === 100 ? "text-green-600"
                        : flowProg.gaps > 0 ? "text-amber-600"
                        : flowPct > 0 ? "text-blue-600"
                        : "text-muted-foreground/50"
                      }`}>
                        {flowPct}%
                      </span>
                    )}
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
