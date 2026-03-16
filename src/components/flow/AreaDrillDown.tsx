"use client";

import { Badge } from "@/components/ui/badge";
import type { FunctionalAreaOverviewData } from "@/types/flow";

interface AreaDrillDownProps {
  area: FunctionalAreaOverviewData;
  assessmentId: string;
  onBack: () => void;
}

export function AreaDrillDown({ area, assessmentId, onBack }: AreaDrillDownProps) {
  return (
    <div>
      <button onClick={onBack} className="text-sm text-blue-500 hover:text-blue-600 mb-4">
        &larr; Back to overview
      </button>

      <h2 className="text-lg font-semibold">{area.functionalArea}</h2>
      <p className="text-sm text-muted-foreground mt-1">
        {area.selectedCount} scope items selected &middot; {area.completionPct}% complete
      </p>

      <div className="mt-4 border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-left">
              <th className="px-4 py-2 font-medium">Scope Item</th>
              <th className="px-4 py-2 font-medium text-center">Steps</th>
              <th className="px-4 py-2 font-medium text-center">Completion</th>
              <th className="px-4 py-2 font-medium text-center">Status</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {area.scopeItems.map((si) => {
              return (
                <tr key={si.scopeItemId} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <span className="font-medium">{si.scopeItemName}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{si.totalSteps}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${si.completionPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{si.completionPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {si.fitCount > 0 && (
                        <Badge className="bg-green-50 text-green-700 text-xs">{si.fitCount}</Badge>
                      )}
                      {si.configureCount > 0 && (
                        <Badge className="bg-blue-50 text-blue-700 text-xs">{si.configureCount}</Badge>
                      )}
                      {si.gapCount > 0 && (
                        <Badge className="bg-amber-50 text-amber-700 text-xs">{si.gapCount}</Badge>
                      )}
                      {si.pendingCount > 0 && (
                        <Badge className="bg-slate-50 text-slate-500 text-xs">{si.pendingCount}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/assessment/${assessmentId}/process-map?scopeItem=${si.scopeItemId}`}
                      className="text-xs text-blue-500 hover:text-blue-600"
                    >
                      View Flow &rarr;
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
