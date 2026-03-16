"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import {
  getAvailableTours,
  getAllToursForRole,
  type TourDefinition,
} from "@/lib/tour/tours";
import {
  isTourComplete,
  markTourComplete,
  markTourDismissed,
  resetTour as resetTourStorage,
} from "@/lib/tour/storage";
import type { UserRole } from "@/types/assessment";

interface TourContextValue {
  /** Start a specific tour by ID */
  startTour: (tourId: string) => void;
  /** Reset a tour so it can be shown again */
  resetTour: (tourId: string) => void;
  /** Check if a tour has been completed */
  isComplete: (tourId: string) => boolean;
  /** All tours available for the current user's role */
  availableTours: TourDefinition[];
  /** Whether a tour is currently active */
  isActive: boolean;
}

const TourContext = createContext<TourContextValue>({
  startTour: () => {},
  resetTour: () => {},
  isComplete: () => false,
  availableTours: [],
  isActive: false,
});

export function useTour() {
  return useContext(TourContext);
}

interface TourProviderProps {
  children: ReactNode;
  userRole: UserRole;
}

export function TourProvider({ children, userRole }: TourProviderProps) {
  const pathname = usePathname();
  const [isActive, setIsActive] = useState(false);
  const [mounted, setMounted] = useState(false);
  const driverRef = useRef<Driver | null>(null);
  const autoTourTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const availableTours = getAllToursForRole(userRole);

  const startTour = useCallback(
    (tourId: string) => {
      const tourDef = availableTours.find((t) => t.id === tourId);
      if (!tourDef) return;

      // Check which steps have matching elements in the DOM
      const validSteps: DriveStep[] = [];
      for (const step of tourDef.steps) {
        const el = document.querySelector(step.element);
        if (el) {
          validSteps.push({
            element: step.element,
            popover: {
              title: step.title,
              description: step.description,
              side: step.side ?? "bottom",
            },
          });
        }
      }

      if (validSteps.length === 0) return;

      // Destroy any existing tour
      driverRef.current?.destroy();

      let reachedLastStep = false;

      const d = driver({
        showProgress: true,
        showButtons: ["next", "previous", "close"],
        animate: true,
        overlayColor: "rgba(0, 0, 0, 0.55)",
        stagePadding: 8,
        stageRadius: 8,
        popoverOffset: 12,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        steps: validSteps,
        onDestroyStarted: () => {
          if (reachedLastStep) {
            // User clicked "Done" on last step — mark as completed
            markTourComplete(tourId);
          } else {
            // User dismissed early — mark as dismissed
            markTourDismissed(tourId);
          }
          d.destroy();
          setIsActive(false);
        },
        onDestroyed: () => {
          setIsActive(false);
        },
        onHighlightStarted: (_el, step) => {
          // Track if we've reached the last step
          const stepIndex = validSteps.indexOf(step);
          if (stepIndex === validSteps.length - 1) {
            reachedLastStep = true;
          }
        },
      });

      driverRef.current = d;
      setIsActive(true);
      d.drive();
    },
    [availableTours],
  );

  const resetTourFn = useCallback((tourId: string) => {
    resetTourStorage(tourId);
  }, []);

  const isCompleteFn = useCallback((tourId: string) => {
    return isTourComplete(tourId);
  }, []);

  // Auto-trigger tours for the current page (first visit only)
  useEffect(() => {
    if (!mounted || !pathname) return;

    // Small delay to let the page render and DOM elements appear
    const timer = setTimeout(() => {
      const pageTours = getAvailableTours(userRole, pathname);
      for (const tour of pageTours) {
        // Skip if already completed, dismissed, or was auto-triggered this session
        if (isTourComplete(tour.id)) continue;
        if (autoTourTriggeredRef.current === tour.id) continue;

        // Only auto-trigger the first matching uncompleted tour
        autoTourTriggeredRef.current = tour.id;
        startTour(tour.id);
        break;
      }
    }, 1500); // 1.5s delay for DOM to stabilize

    return () => clearTimeout(timer);
  }, [mounted, pathname, userRole, startTour]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  return (
    <TourContext.Provider
      value={{
        startTour,
        resetTour: resetTourFn,
        isComplete: isCompleteFn,
        availableTours,
        isActive,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}
