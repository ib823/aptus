"use client";

import { ProcessMapCanvas } from "./ProcessMapCanvas";
import { ProcessMapLegend } from "./ProcessMapLegend";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { HierarchyTree } from "@/types/hierarchy";

interface ProcessMapProps {
  tree: HierarchyTree;
  onActivitySelect: (activityId: string) => void;
}

export function ProcessMap({ tree, onActivitySelect }: ProcessMapProps) {
  if (tree.processes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No process hierarchy available for this scope item.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{tree.scopeItemName}</h2>
        <ProcessMapLegend />
      </div>
      <ScrollArea className="rounded-lg border bg-white">
        <div className="p-2">
          <ProcessMapCanvas tree={tree} onActivitySelect={onActivitySelect} />
        </div>
      </ScrollArea>
    </div>
  );
}
