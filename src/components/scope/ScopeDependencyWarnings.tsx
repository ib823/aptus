"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ScopeDependencyWarning {
  targetScopeCode: string;
  targetScopeName: string;
  missingScopeCode: string;
  missingScopeName: string;
  businessReason: string;
}

interface ScopeDependencyWarningsProps {
  warnings: ScopeDependencyWarning[];
  onAddScope: (scopeItemId: string) => void;
}

export function ScopeDependencyWarnings({
  warnings,
  onAddScope,
}: ScopeDependencyWarningsProps) {
  if (warnings.length === 0) return null;

  // Group by missing scope to avoid duplicate entries
  const grouped = new Map<string, ScopeDependencyWarning[]>();
  for (const w of warnings) {
    const existing = grouped.get(w.missingScopeCode);
    if (existing) {
      existing.push(w);
    } else {
      grouped.set(w.missingScopeCode, [w]);
    }
  }

  return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-amber-800">
            {warnings.length} scope {warnings.length === 1 ? "item has" : "items have"} unresolved dependencies
          </h3>
          <ul className="mt-2 space-y-2">
            {Array.from(grouped.entries()).map(([missingCode, groupWarnings]) => {
              const dependents = groupWarnings.map((w) => `${w.targetScopeName} (${w.targetScopeCode})`);
              const first = groupWarnings[0]!;
              return (
                <li key={missingCode} className="flex items-start gap-2 text-sm text-amber-700">
                  <span className="flex-1">
                    <span className="font-medium">{first.missingScopeName}</span>
                    {" "}({missingCode}) is needed by{" "}
                    {dependents.length <= 2
                      ? dependents.join(" and ")
                      : `${dependents.slice(0, 2).join(", ")} and ${dependents.length - 2} more`}
                    {" "}&mdash; not selected
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
                    onClick={() => onAddScope(missingCode)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add {missingCode}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
