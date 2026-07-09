"use client";

/**
 * AffirmLearnProvider — the affirm training layer's root.
 *
 * Mounted once in the affirm route-group layout, it:
 *   - owns the glossary drawer open/focus state,
 *   - runs the per-screen coach-mark tour (driver.js) and auto-starts it
 *     on a screen's first visit (tracked in localStorage),
 *   - renders the always-available <LearnToolbar> and <GlossaryDrawer>,
 *   - and exposes openGlossary/startTour to the whole affirm subtree via
 *     context (consumed by <Term>, <ScreenGuide>, the toolbar).
 *
 * Deliberately affirm-scoped and independent of the portal TourProvider
 * (whose path.includes() matching collides with affirm's sub-routes).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { driver, type Driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { tourForPath } from "@/lib/affirm/learn-tours";
import type { GlossaryKey } from "@/constants/affirm-glossary";
import { AffirmLearnContext } from "./context";
import { GlossaryDrawer } from "./GlossaryDrawer";
import { LearnToolbar } from "./LearnToolbar";

const tourDoneKey = (id: string) => `affirm-tour-done:${id}`;

export function AffirmLearnProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [focusTerm, setFocusTerm] = useState<GlossaryKey | null>(null);
  const [mounted, setMounted] = useState(false);
  const driverRef = useRef<Driver | null>(null);
  const autoRanRef = useRef<string | null>(null);

  useEffect(() => setMounted(true), []);

  const openGlossary = useCallback((term?: GlossaryKey) => {
    setFocusTerm(term ?? null);
    setGlossaryOpen(true);
  }, []);

  const runTour = useCallback(() => {
    const tour = tourForPath(pathname);
    if (!tour) return;

    // Only include steps whose anchor is actually on the page.
    const steps: DriveStep[] = [];
    for (const s of tour.steps) {
      if (document.querySelector(s.element)) {
        steps.push({
          element: s.element,
          popover: {
            title: s.title,
            description: s.description,
            side: s.side ?? "bottom",
          },
        });
      }
    }
    if (steps.length === 0) return;

    driverRef.current?.destroy();
    const markDone = () => {
      try {
        localStorage.setItem(tourDoneKey(tour.id), "1");
      } catch {
        /* ignore */
      }
    };

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
      doneBtnText: "Got it",
      steps,
      onDestroyStarted: () => {
        // Whether finished or dismissed, don't auto-nag again on this screen.
        markDone();
        d.destroy();
      },
    });
    driverRef.current = d;
    d.drive();
  }, [pathname]);

  // Auto-start the tour once per screen (first visit only).
  useEffect(() => {
    if (!mounted || !pathname) return;
    const tour = tourForPath(pathname);
    if (!tour) return;
    if (autoRanRef.current === tour.id) return;

    let done = false;
    try {
      done = localStorage.getItem(tourDoneKey(tour.id)) === "1";
    } catch {
      /* ignore */
    }
    if (done) {
      autoRanRef.current = tour.id;
      return;
    }

    const timer = setTimeout(() => {
      autoRanRef.current = tour.id;
      runTour();
    }, 1400);
    return () => clearTimeout(timer);
  }, [mounted, pathname, runTour]);

  // Clean up any active tour on unmount.
  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  const hasTour = mounted && tourForPath(pathname) != null;

  return (
    <AffirmLearnContext.Provider value={{ openGlossary, startTour: runTour, hasTour }}>
      {children}
      <LearnToolbar />
      <GlossaryDrawer
        open={glossaryOpen}
        onOpenChange={setGlossaryOpen}
        focusTerm={focusTerm}
      />
    </AffirmLearnContext.Provider>
  );
}
