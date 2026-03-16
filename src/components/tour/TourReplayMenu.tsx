"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { GraduationCap, Play, RotateCcw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/components/tour/TourProvider";
import { toast } from "sonner";
import type { TourDefinition } from "@/lib/tour/tours";

/** Check if a tour can be started from the current page */
function canStartTour(tour: TourDefinition, currentPath: string): boolean {
  // Portal-level tours with fixed navigateTo — always reachable
  if (tour.navigateTo && !tour.navigateTo.includes("{assessmentId}")) {
    return true;
  }

  // Assessment tours — only reachable if user is inside an assessment
  if (tour.navigateTo?.includes("{assessmentId}")) {
    return /\/assessment\/[^/]+/.test(currentPath);
  }

  // Tours matching the current page
  if (tour.exactPath) {
    return currentPath === tour.pathMatch || currentPath.endsWith(tour.pathMatch);
  }
  return currentPath.includes(tour.pathMatch);
}

export function TourReplayMenu() {
  const { availableTours, startTour, resetTour, isComplete, isActive } = useTour();
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  // Only show tours that can actually be started from the current page
  const reachableTours = availableTours.filter((t) => canStartTour(t, pathname));

  if (reachableTours.length === 0) return null;

  // Group tours: "This Page" vs "Other Pages"
  const currentPageTours: TourDefinition[] = [];
  const otherPageTours: TourDefinition[] = [];

  for (const tour of reachableTours) {
    const isOnPage = tour.exactPath
      ? pathname === tour.pathMatch || pathname.endsWith(tour.pathMatch)
      : pathname.includes(tour.pathMatch);
    if (isOnPage) {
      currentPageTours.push(tour);
    } else {
      otherPageTours.push(tour);
    }
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 text-xs"
        onClick={() => setOpen(!open)}
        disabled={isActive}
        aria-label="Product tours"
      >
        <GraduationCap className="size-4" />
        <span className="hidden sm:inline">Tours</span>
        <ChevronDown className="size-3" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border bg-card shadow-lg z-50 py-1">
            <div className="px-3 py-2 border-b">
              <p className="text-xs font-semibold text-foreground">Guided Tours</p>
              <p className="text-[10px] text-muted-foreground">
                Interactive walkthroughs to help you learn the platform
              </p>
            </div>

            <div className="max-h-64 overflow-y-auto py-1">
              {currentPageTours.length > 0 && (
                <>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    This Page
                  </p>
                  {currentPageTours.map((tour) => (
                    <TourItem
                      key={tour.id}
                      tour={tour}
                      completed={isComplete(tour.id)}
                      onStart={() => {
                        setOpen(false);
                        setTimeout(() => {
                          if (isComplete(tour.id)) resetTour(tour.id);
                          startTour(tour.id);
                        }, 150);
                      }}
                      onReset={() => {
                        resetTour(tour.id);
                        toast.success(`"${tour.title}" tour reset`);
                      }}
                    />
                  ))}
                </>
              )}

              {otherPageTours.length > 0 && (
                <>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {currentPageTours.length > 0 ? "Other Pages" : "Available Tours"}
                  </p>
                  {otherPageTours.map((tour) => (
                    <TourItem
                      key={tour.id}
                      tour={tour}
                      completed={isComplete(tour.id)}
                      onStart={() => {
                        setOpen(false);
                        setTimeout(() => {
                          if (isComplete(tour.id)) resetTour(tour.id);
                          startTour(tour.id);
                        }, 150);
                      }}
                      onReset={() => {
                        resetTour(tour.id);
                        toast.success(`"${tour.title}" tour reset`);
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TourItem({
  tour,
  completed,
  onStart,
  onReset,
}: {
  tour: TourDefinition;
  completed: boolean;
  onStart: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors">
      <div className="flex-1 min-w-0 mr-2">
        <p className="text-sm font-medium text-foreground truncate">
          {tour.title}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {tour.description}
          {completed && " — completed"}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {completed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Reset tour"
            onClick={onReset}
          >
            <RotateCcw className="size-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title={completed ? "Replay tour" : "Start tour"}
          onClick={onStart}
        >
          <Play className="size-3" />
        </Button>
      </div>
    </div>
  );
}
