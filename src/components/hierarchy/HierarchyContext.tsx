"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { HierarchyTree, ActivityProgressMap } from "@/types/hierarchy";

type ViewMode = "map" | "activity" | "step";

interface HierarchyState {
  tree: HierarchyTree | null;
  progressMap: ActivityProgressMap | null;
  currentScopeItemId: string | null;
  currentActivityId: string | null;
  currentStepIndex: number;
  view: ViewMode;
  setTree: (tree: HierarchyTree | null) => void;
  setProgressMap: (map: ActivityProgressMap | null) => void;
  setCurrentScopeItemId: (id: string | null) => void;
  selectActivity: (activityId: string) => void;
  setCurrentStepIndex: (index: number) => void;
  setView: (view: ViewMode) => void;
  goToMap: () => void;
}

const HierarchyContext = createContext<HierarchyState | null>(null);

export function HierarchyProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<HierarchyTree | null>(null);
  const [progressMap, setProgressMap] = useState<ActivityProgressMap | null>(null);
  const [currentScopeItemId, setCurrentScopeItemId] = useState<string | null>(null);
  const [currentActivityId, setCurrentActivityId] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [view, setView] = useState<ViewMode>("map");

  const selectActivity = useCallback((activityId: string) => {
    setCurrentActivityId(activityId);
    setCurrentStepIndex(0);
    setView("step");
  }, []);

  const goToMap = useCallback(() => {
    setCurrentActivityId(null);
    setCurrentStepIndex(0);
    setView("map");
  }, []);

  return (
    <HierarchyContext.Provider
      value={{
        tree,
        progressMap,
        currentScopeItemId,
        currentActivityId,
        currentStepIndex,
        view,
        setTree,
        setProgressMap,
        setCurrentScopeItemId,
        selectActivity,
        setCurrentStepIndex,
        setView,
        goToMap,
      }}
    >
      {children}
    </HierarchyContext.Provider>
  );
}

export function useHierarchy(): HierarchyState {
  const ctx = useContext(HierarchyContext);
  if (!ctx) {
    throw new Error("useHierarchy must be used within HierarchyProvider");
  }
  return ctx;
}
