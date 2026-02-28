"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AreaDrillDown } from "./AreaDrillDown";
import type { FunctionalAreaOverviewData } from "@/types/flow";

interface FunctionalAreaMapProps {
  areas: FunctionalAreaOverviewData[];
  assessmentId: string;
  assignedAreas?: string[] | undefined;
}

function riskBadge(score: number) {
  if (score < 0.3) return { label: "Low Risk", className: "bg-green-100 text-green-700" };
  if (score < 0.6) return { label: "Medium Risk", className: "bg-amber-100 text-amber-700" };
  if (score < 0.8) return { label: "High Risk", className: "bg-orange-100 text-orange-700" };
  return { label: "Critical Risk", className: "bg-red-100 text-red-700" };
}

export function FunctionalAreaMap({ areas, assessmentId, assignedAreas }: FunctionalAreaMapProps) {
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

  const selected = areas.find((a) => a.functionalArea === selectedArea);

  if (selected) {
    return (
      <AreaDrillDown
        area={selected}
        assessmentId={assessmentId}
        onBack={() => setSelectedArea(null)}
      />
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Functional Area Overview</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {areas.map((area) => {
          const isAssigned = !assignedAreas || assignedAreas.includes(area.functionalArea);
          const risk = riskBadge(area.riskScore);
          const borderColor = area.completionPct >= 75
            ? "border-l-[3px] border-l-green-500"
            : area.completionPct >= 50
              ? "border-l-[3px] border-l-blue-500"
              : area.completionPct >= 25
                ? "border-l-[3px] border-l-amber-500"
                : "border-l-[3px] border-l-slate-300";

          return (
            <button
              key={area.functionalArea}
              onClick={() => isAssigned ? setSelectedArea(area.functionalArea) : undefined}
              disabled={!isAssigned}
              className={`text-left p-4 border rounded-lg transition-all ${borderColor} ${
                isAssigned
                  ? "bg-card hover:bg-accent hover:shadow-sm cursor-pointer"
                  : "bg-muted/30 opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-start justify-between">
                <h3 className="font-medium text-sm">{area.functionalArea}</h3>
                <Badge className={`text-xs ${risk.className}`}>{risk.label}</Badge>
              </div>

              <p className="text-xs text-muted-foreground mt-1">
                {area.selectedCount} of {area.totalScopeItems} scope items
              </p>

              {/* Completion bar */}
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Completion</span>
                  <span>{area.completionPct}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${area.completionPct}%` }}
                  />
                </div>
              </div>

              {/* Status breakdown */}
              {isAssigned && (
                <div className="mt-3 flex gap-2 text-xs">
                  <span className="text-green-600">{area.fitCount} FIT</span>
                  <span className="text-blue-600">{area.configureCount} CFG</span>
                  <span className="text-amber-600">{area.gapCount} GAP</span>
                  <span className="text-slate-500">{area.pendingCount} PND</span>
                </div>
              )}

              {/* Cross-area deps indicator */}
              {area.crossAreaDeps.length > 0 && isAssigned && (
                <p className="text-xs text-muted-foreground mt-2">
                  {area.crossAreaDeps.length} cross-area dependencies
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Cross-area dependency visualization */}
      {areas.some((a) => a.crossAreaDeps.length > 0) && (
        <div className="mt-6 p-4 bg-muted/30 rounded-lg">
          <h3 className="text-sm font-medium mb-2">Cross-Area Dependencies</h3>
          <div className="space-y-1">
            {areas.flatMap((a) =>
              a.crossAreaDeps.map((dep, i) => (
                <div key={`${a.functionalArea}-${i}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium">{dep.fromArea}</span>
                  <span>&rarr;</span>
                  <span className="font-medium">{dep.toArea}</span>
                  <span className="text-muted-foreground/60">&mdash; {dep.reason}</span>
                </div>
              )),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
