"use client";

import { useState, useRef, useCallback } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { TOUCH_TARGETS } from "@/types/pwa";
import type { FitStatus } from "@/types/assessment";

interface Step {
  id: string;
  title: string;
  fitStatus?: FitStatus | undefined;
}

interface MobileStepNavigatorProps {
  steps: Step[];
  currentIndex?: number | undefined;
  onIndexChange?: ((index: number) => void) | undefined;
  onFitStatusChange?: ((stepId: string, status: FitStatus) => void) | undefined;
}

const fitStatusOptions: { value: FitStatus; label: string; className: string }[] = [
  { value: "FIT", label: "FIT", className: "bg-green-600 text-white hover:bg-green-700" },
  { value: "CONFIGURE", label: "CFG", className: "bg-blue-600 text-white hover:bg-blue-700" },
  { value: "GAP", label: "GAP", className: "bg-red-600 text-white hover:bg-red-700" },
  { value: "NA", label: "N/A", className: "bg-neutral-600 text-white hover:bg-neutral-700" },
];

const SWIPE_THRESHOLD = 50;

export function MobileStepNavigator({
  steps,
  currentIndex,
  onIndexChange,
  onFitStatusChange,
}: MobileStepNavigatorProps) {
  const [internalIndex, setInternalIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);

  const index = currentIndex ?? internalIndex;
  const currentStep = steps[index];
  const progress = steps.length > 0 ? ((index + 1) / steps.length) * 100 : 0;

  const goTo = useCallback(
    (newIndex: number) => {
      const clamped = Math.max(0, Math.min(newIndex, steps.length - 1));
      if (onIndexChange) {
        onIndexChange(clamped);
      } else {
        setInternalIndex(clamped);
      }
    },
    [steps.length, onIndexChange],
  );

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    if (touch) {
      touchStartX.current = touch.clientX;
      touchDeltaX.current = 0;
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const touch = e.touches[0];
    if (touch) {
      touchDeltaX.current = touch.clientX - touchStartX.current;
    }
  }

  function handleTouchEnd() {
    if (Math.abs(touchDeltaX.current) > SWIPE_THRESHOLD) {
      if (touchDeltaX.current > 0) {
        goTo(index - 1);
      } else {
        goTo(index + 1);
      }
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
  }

  if (steps.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No steps available.
      </div>
    );
  }

  return (
    <div
      className="space-y-4 p-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Step {index + 1} of {steps.length}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} />
      </div>

      {/* Current step */}
      <div className="rounded-lg border p-4">
        <h3 className="text-sm font-medium leading-snug">
          {currentStep?.title ?? "Untitled Step"}
        </h3>
      </div>

      {/* Classification buttons */}
      {onFitStatusChange && currentStep && (
        <div className="grid grid-cols-4 gap-2">
          {fitStatusOptions.map(({ value, label, className }) => (
            <Button
              key={value}
              variant="outline"
              className={cn(
                "text-sm font-semibold",
                currentStep.fitStatus === value && className,
              )}
              style={{
                minHeight: TOUCH_TARGETS.comfortable,
              }}
              onClick={() => onFitStatusChange(currentStep.id, value)}
            >
              {label}
            </Button>
          ))}
        </div>
      )}

      {/* Navigation arrows */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="lg"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          style={{ minWidth: TOUCH_TARGETS.comfortable, minHeight: TOUCH_TARGETS.comfortable }}
          aria-label="Previous step"
        >
          <ChevronLeftIcon className="size-5" />
          <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => goTo(index + 1)}
          disabled={index >= steps.length - 1}
          style={{ minWidth: TOUCH_TARGETS.comfortable, minHeight: TOUCH_TARGETS.comfortable }}
          aria-label="Next step"
        >
          <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
          <ChevronRightIcon className="size-5" />
        </Button>
      </div>
    </div>
  );
}
