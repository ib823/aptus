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
  setPendingTour,
  consumePendingTour,
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

      if (validSteps.length === 0) {
        // Elements not on this page — navigate to the right page
        // But ONLY if we're not already on the target page (prevents infinite reload loop)
        if (tourDef.navigateTo) {
          const currentPath = window.location.pathname;
          const assessmentMatch = currentPath.match(/\/assessment\/([^/]+)/);
          const assessmentId = assessmentMatch?.[1];
          let targetUrl = tourDef.navigateTo;
          if (targetUrl.includes("{assessmentId}")) {
            if (!assessmentId) return;
            targetUrl = targetUrl.replace("{assessmentId}", assessmentId);
          }
          // Don't navigate if already on the target page — elements just don't exist
          if (currentPath === targetUrl || currentPath.startsWith(targetUrl + "/")) {
            return;
          }
          setPendingTour(tourId);
          window.location.href = targetUrl;
        }
        return;
      }

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

  // Auto-trigger tours: check for pending tour (from cross-page navigation) or first-visit
  useEffect(() => {
    if (!mounted || !pathname) return;

    const timer = setTimeout(() => {
      // Priority 1: Check for a pending tour (user clicked play from another page)
      const pendingTourId = consumePendingTour();
      if (pendingTourId) {
        startTour(pendingTourId);
        return;
      }

      // Priority 2: Auto-trigger first uncompleted tour for this page
      const pageTours = getAvailableTours(userRole, pathname);
      for (const tour of pageTours) {
        if (isTourComplete(tour.id)) continue;
        if (autoTourTriggeredRef.current === tour.id) continue;

        autoTourTriggeredRef.current = tour.id;
        startTour(tour.id);
        break;
      }
    }, 1500);

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
