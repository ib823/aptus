"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { HierarchyTreeSidebar } from "./HierarchyTreeSidebar";
import type { HierarchyTree, ActivityProgressMap } from "@/types/hierarchy";

interface MobileHierarchySheetProps {
  tree: HierarchyTree;
  currentActivityId: string | null;
  progressMap: ActivityProgressMap | null;
  onActivitySelect: (activityId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileHierarchySheet({
  tree,
  currentActivityId,
  progressMap,
  onActivitySelect,
  open,
  onOpenChange,
}: MobileHierarchySheetProps) {
  const handleSelect = (activityId: string) => {
    onActivitySelect(activityId);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="sm:hidden min-h-[44px] min-w-[44px]">
          <Menu className="w-4 h-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70vh]">
        <SheetHeader>
          <SheetTitle className="text-left">Process Hierarchy</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto mt-4 -mx-6 px-6">
          <HierarchyTreeSidebar
            tree={tree}
            currentActivityId={currentActivityId}
            progressMap={progressMap}
            onActivitySelect={handleSelect}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
