"use client";

import { useMemo } from "react";

interface FlowNode {
  name: string;
  totalSteps: number;
  classifiableSteps: number;
  fit: number;
  gap: number;
  configure: number;
  na: number;
  pending: number;
}

interface ScopeFlowOverviewProps {
  scopeItemName: string;
  steps: Array<{
    solutionProcessFlowName: string | null;
    fitStatus: string;
    isClassifiable?: boolean | null;
  }>;
  onFlowClick: (flowName: string) => void;
}

export function ScopeFlowOverview({ scopeItemName, steps, onFlowClick }: ScopeFlowOverviewProps) {
  const flows = useMemo(() => {
    const flowMap = new Map<string, FlowNode>();

    for (const step of steps) {
      const flowName = step.solutionProcessFlowName || "Other Steps";
      if (!flowMap.has(flowName)) {
        flowMap.set(flowName, {
          name: flowName,
          totalSteps: 0,
          classifiableSteps: 0,
          fit: 0, gap: 0, configure: 0, na: 0, pending: 0,
        });
      }
      const node = flowMap.get(flowName)!;
      node.totalSteps++;
      if (step.isClassifiable !== false) {
        node.classifiableSteps++;
        if (step.fitStatus === "FIT") node.fit++;
        else if (step.fitStatus === "GAP") node.gap++;
        else if (step.fitStatus === "CONFIGURE") node.configure++;
        else if (step.fitStatus === "NA") node.na++;
        else node.pending++;
      }
    }

    return Array.from(flowMap.values());
  }, [steps]);

  if (flows.length <= 1) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Process Flow Overview — {scopeItemName}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {flows.map((flow, index) => {
          const total = flow.classifiableSteps;
          const done = flow.fit + flow.gap + flow.configure + flow.na;
          const pct = total > 0 ? Math.round((done / total) * 100) : 100;

          let borderColor = "border-slate-300";
          let bgColor = "bg-white";
          if (pct === 100 && flow.gap === 0) {
            borderColor = "border-green-400";
            bgColor = "bg-green-50";
          } else if (pct === 100 && flow.gap > 0) {
            borderColor = "border-amber-400";
            bgColor = "bg-amber-50";
          } else if (pct > 0 && done > 0) {
            borderColor = "border-blue-400";
            bgColor = "bg-blue-50";
          }

          return (
            <div key={flow.name} className="flex items-center gap-2">
              <button
                onClick={() => onFlowClick(flow.name)}
                className={`px-3 py-2 rounded-lg border-2 ${borderColor} ${bgColor} hover:shadow-md transition-all text-left min-w-[140px]`}
                title={`Click to review steps in "${flow.name}"`}
              >
                <p className="text-xs font-semibold text-foreground truncate max-w-[180px]" title={flow.name}>
                  {flow.name}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {done}/{total} steps · {pct}%
                </p>
                <div className="flex gap-1 mt-1">
                  {flow.fit > 0 && <span className="w-2 h-2 rounded-full bg-green-500" title={`${flow.fit} FIT`} />}
                  {flow.configure > 0 && <span className="w-2 h-2 rounded-full bg-blue-500" title={`${flow.configure} CONFIGURE`} />}
                  {flow.gap > 0 && <span className="w-2 h-2 rounded-full bg-amber-500" title={`${flow.gap} GAP`} />}
                  {flow.pending > 0 && <span className="w-2 h-2 rounded-full bg-slate-300" title={`${flow.pending} pending`} />}
                </div>
              </button>
              {index < flows.length - 1 && (
                <span className="text-muted-foreground/40 text-lg">&rarr;</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> FIT</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> CONFIGURE</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> GAP</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Pending</span>
      </div>
    </div>
  );
}
