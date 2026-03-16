"use client";

import { useState } from "react";
import { GraduationCap, Play, RotateCcw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTour } from "@/components/tour/TourProvider";
import { toast } from "sonner";

export function TourReplayMenu() {
  const { availableTours, startTour, resetTour, isComplete, isActive } = useTour();
  const [open, setOpen] = useState(false);

  if (availableTours.length === 0) return null;

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
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 w-72 rounded-lg border bg-card shadow-lg z-50 py-1">
            <div className="px-3 py-2 border-b">
              <p className="text-xs font-semibold text-foreground">Guided Tours</p>
              <p className="text-[10px] text-muted-foreground">
                Interactive walkthroughs to help you learn the platform
              </p>
            </div>

            <div className="max-h-64 overflow-y-auto py-1">
              {availableTours.map((tour) => {
                const completed = isComplete(tour.id);
                return (
                  <div
                    key={tour.id}
                    className="flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors"
                  >
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
                          onClick={() => {
                            resetTour(tour.id);
                            toast.success(`"${tour.title}" tour reset`);
                          }}
                        >
                          <RotateCcw className="size-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={completed ? "Replay tour" : "Start tour"}
                        onClick={() => {
                          setOpen(false);
                          // Small delay for dropdown to close
                          setTimeout(() => {
                            if (completed) resetTour(tour.id);
                            startTour(tour.id);
                          }, 150);
                        }}
                      >
                        <Play className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
