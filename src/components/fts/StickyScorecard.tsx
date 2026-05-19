"use client";

import type { DecisionState } from "@/lib/fts/types";

interface Props {
  totalDecisions: number;
  choices: Record<string, DecisionState>;
}

/**
 * Sticky horizontal scorecard that pins to the top of the workbench page
 * and updates live as the user makes decisions.
 */
export function StickyScorecard({ totalDecisions, choices }: Props) {
  const std = Object.values(choices).filter((c) => c.choice === "std").length;
  const cfg = Object.values(choices).filter((c) => c.choice === "cfg").length;
  const cst = Object.values(choices).filter((c) => c.choice === "cst").length;
  const effort = Object.values(choices)
    .filter((c) => c.choice === "cst")
    .reduce((s, c) => s + (c.effort || 0), 0);
  const open = totalDecisions - (std + cfg + cst);

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-6">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span>
              Standard: <span className="font-bold">{std}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>
              Configure: <span className="font-bold">{cfg}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>
              Custom (chargeable): <span className="font-bold">{cst}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-300" />
            <span>
              Open: <span className="font-bold">{open}</span>
            </span>
          </div>
        </div>
        <div className="text-sm">
          <span className="text-slate-500">Estimated extra effort:</span>{" "}
          <span className="font-bold text-slate-900">{effort} days</span>
        </div>
      </div>
    </div>
  );
}
