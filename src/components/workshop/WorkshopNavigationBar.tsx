"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkshopNavigationBarProps {
  currentIndex: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  disabled?: boolean | undefined;
}

export function WorkshopNavigationBar({
  currentIndex,
  totalSteps,
  onPrevious,
  onNext,
  disabled,
}: WorkshopNavigationBarProps) {
  return (
    <div className="flex items-center justify-between border-t pt-4 mt-4">
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={(disabled ?? false) || currentIndex <= 0}
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Step {currentIndex + 1} of {totalSteps}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={(disabled ?? false) || currentIndex >= totalSteps - 1}
      >
        Next
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}
