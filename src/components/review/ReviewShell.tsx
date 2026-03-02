"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StepReviewCard } from "@/components/review/StepReviewCard";
import { ReferenceStepRow } from "@/components/review/ReferenceStepRow";
import { ClassifiableProgressBar } from "@/components/review/ClassifiableProgressBar";
import { HierarchyProvider, useHierarchy } from "@/components/hierarchy/HierarchyContext";
import { HierarchyTreeSidebar } from "@/components/hierarchy/HierarchyTreeSidebar";
import { HierarchyBreadcrumb } from "@/components/hierarchy/HierarchyBreadcrumb";
import { ProcessMap } from "@/components/hierarchy/ProcessMap";
import { ActivityCompletionCard } from "@/components/hierarchy/ActivityCompletionCard";
import { MobileHierarchySheet } from "@/components/hierarchy/MobileHierarchySheet";
import { groupStepsByActivity, computeClassifiableProgress, type StepInGroup } from "@/lib/assessment/step-grouper";
import { ScopeFlowOverview } from "@/components/review/ScopeFlowOverview";
import { ScopeItemSummary } from "@/components/review/ScopeItemSummary";
import { BusinessQuestionCard } from "@/components/review/BusinessQuestionCard";
import { ImplicationsPanel } from "@/components/review/ImplicationsPanel";
import { getScopeItemMetadata, getActivityMetadata } from "@/constants/scope-item-metadata";
import { DependencyEffectsPanel } from "@/components/review/DependencyEffectsPanel";
import { isFeatureEnabled } from "@/lib/feature-flags";
import type { DependencyEffects } from "@/lib/dependency/types";
import type { HierarchyTree, ActivityProgressMap, ActivityNode } from "@/types/hierarchy";

interface ScopeItemNav {
  id: string;
  nameClean: string;
  functionalArea: string;
  totalSteps: number;
  reviewedSteps: number;
  fit: number;
  configure: number;
  gap: number;
  na: number;
  pending: number;
}

interface StepData {
  id: string;
  sequence: number;
  actionTitle: string;
  actionInstructionsHtml: string;
  actionExpectedResult: string | null;
  stepType: string;
  processFlowGroup: string | null;
  activityTitle: string | null;
  activityTargetUrl: string | null;
  activityId: string | null;
  solutionProcessFlowName: string | null;
  fitStatus: string;
  clientNote: string | null;
  currentProcess: string | null;
  stepCategory?: string | null;
  isClassifiable?: boolean | null;
  confidence?: string | null;
  evidenceUrls?: string[];
}

interface ConfigItem {
  id: string;
  configItemName: string;
  category: string;
  selfService: boolean;
}

interface OverallProgress {
  totalSteps: number;
  classifiableSteps?: number;
  reviewedSteps: number;
  fit: number;
  configure: number;
  gap: number;
  na: number;
  pending: number;
}

interface ReviewShellProps {
  assessmentId: string;
  assessmentStatus: string;
  userRole: string;
  scopeItems: ScopeItemNav[];
  initialProgress: OverallProgress;
  initialScopeItemId?: string | undefined;
}

type ReviewMode = "steps" | "questions";

const STATUS_DISPLAY_LABELS: Record<string, string> = {
  FIT: "Matches",
  CONFIGURE: "Needs Adjustment",
  GAP: "Doesn\u2019t Match",
  NA: "Not Relevant",
  PENDING: "Unreviewed",
};

const NON_CLASSIFIABLE_TYPES = ["LOGON", "LOGOFF", "ACCESS_APP", "INFORMATION", "NAVIGATION"];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function ReviewShellInner({
  assessmentId,
  assessmentStatus,
  userRole,
  scopeItems: initialScopeItems,
  initialProgress,
  initialScopeItemId,
}: ReviewShellProps) {
  const {
    tree,
    progressMap,
    currentActivityId,
    currentStepIndex,
    view,
    setView,
    setTree,
    setProgressMap,
    selectActivity,
    setCurrentStepIndex,
    goToMap,
  } = useHierarchy();

  const queryClient = useQueryClient();

  const [scopeItems] = useState(initialScopeItems);
  // REM-33: If initialScopeItemId is provided (from ?scopeItem= query param), use it
  const resolvedInitialId = initialScopeItemId && initialScopeItems.some((i) => i.id === initialScopeItemId)
    ? initialScopeItemId
    : initialScopeItems[0]?.id ?? null;
  const [currentScopeItemId, setCurrentScopeItemId] = useState<string | null>(resolvedInitialId);
  const [localStepOverrides, setLocalStepOverrides] = useState<Map<string, Partial<StepData>>>(new Map());
  const [dependencyEffectsMap, setDependencyEffectsMap] = useState<Map<string, DependencyEffects>>(new Map());
  const dependencyEngineEnabled = isFeatureEnabled("DEPENDENCY_ENGINE");
  const [overallProgress] = useState(initialProgress);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [bulkAllLoading, setBulkAllLoading] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [reviewMode, setReviewMode] = useState<ReviewMode>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "steps") return "steps";
    }
    return "questions";
  });

  // Sync review mode to URL
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", reviewMode);
    window.history.replaceState({}, "", url.toString());
  }, [reviewMode]);

  const isReadOnly = assessmentStatus === "signed_off" || assessmentStatus === "reviewed";
  const isItLead = userRole === "it_lead";

  // Fetch hierarchy tree
  const { data: hierarchyData } = useQuery({
    queryKey: ["hierarchy-tree", currentScopeItemId],
    queryFn: () =>
      fetchJson<HierarchyTree>(
        `/api/catalog/scope-items/${currentScopeItemId}/hierarchy?assessmentId=${assessmentId}`,
      ),
    enabled: !!currentScopeItemId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (hierarchyData && Array.isArray(hierarchyData.processes)) setTree(hierarchyData);
  }, [hierarchyData, setTree]);

  // Fetch activity progress
  const { data: progressData } = useQuery({
    queryKey: ["hierarchy-progress", assessmentId, currentScopeItemId],
    queryFn: () =>
      fetchJson<ActivityProgressMap>(
        `/api/assessments/${assessmentId}/hierarchy/progress?scopeItemId=${currentScopeItemId}`,
      ),
    enabled: !!currentScopeItemId,
    staleTime: 2 * 60 * 1000,
  });

  useEffect(() => {
    if (progressData) setProgressMap(progressData);
  }, [progressData, setProgressMap]);

  // Fetch activity-scoped steps when an activity is selected
  const { data: activityStepsData, isLoading: stepsLoading } = useQuery({
    queryKey: ["activity-steps", currentScopeItemId, currentActivityId],
    queryFn: () =>
      fetchJson<{ data: StepData[] }>(
        `/api/catalog/scope-items/${currentScopeItemId}/activities/${currentActivityId}/steps?limit=200`,
      ),
    enabled: !!currentScopeItemId && !!currentActivityId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch configs (REM-03: pass assessmentId for country filtering)
  const { data: configsData } = useQuery({
    queryKey: ["catalog-configs", currentScopeItemId, assessmentId],
    queryFn: () =>
      fetchJson<{ data: ConfigItem[] }>(
        `/api/catalog/scope-items/${currentScopeItemId}/configs?assessmentId=${assessmentId}`,
      ),
    enabled: !!currentScopeItemId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch step responses
  const { data: responsesData } = useQuery({
    queryKey: ["step-responses", assessmentId, currentScopeItemId],
    queryFn: () =>
      fetchJson<{ data: Array<{ processStepId: string; fitStatus: string; clientNote: string | null; currentProcess: string | null; confidence?: string | null }> }>(
        `/api/assessments/${assessmentId}/steps?scopeItemId=${currentScopeItemId}&limit=200`,
      ),
    enabled: !!currentScopeItemId,
    staleTime: 60 * 1000,
  });

  // Merge steps with responses
  const steps = useMemo(() => {
    if (!activityStepsData?.data) return [];
    const responseMap = new Map<string, { fitStatus: string; clientNote: string | null; currentProcess: string | null; confidence?: string | null }>();
    for (const r of responsesData?.data ?? []) {
      responseMap.set(r.processStepId, r);
    }
    return activityStepsData.data.map((step) => {
      const response = responseMap.get(step.id);
      const override = localStepOverrides.get(step.id);
      return {
        ...step,
        fitStatus: override?.fitStatus ?? response?.fitStatus ?? "PENDING",
        clientNote: override?.clientNote ?? response?.clientNote ?? null,
        currentProcess: override?.currentProcess ?? response?.currentProcess ?? null,
        confidence: (override?.confidence ?? response?.confidence ?? null) as string | null,
      };
    });
  }, [activityStepsData, responsesData, localStepOverrides]);

  const configs = useMemo(() => configsData?.data ?? [], [configsData]);

  // Group steps
  const stepGroups = useMemo(() => groupStepsByActivity(steps), [steps]);
  const classifiableProgress = useMemo(() => computeClassifiableProgress(stepGroups as never[]), [stepGroups]);

  // Indices of classifiable steps (for skip-navigation)
  const visibleStepIndices = useMemo(() => {
    if (showAllSteps) return steps.map((_, i) => i);
    return steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.isClassifiable !== false && !NON_CLASSIFIABLE_TYPES.includes(s.stepType))
      .map(({ i }) => i);
  }, [steps, showAllSteps]);

  const hiddenStepCount = steps.length - visibleStepIndices.length;

  // Auto-skip to first classifiable step when entering an activity
  const prevActivityRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentActivityId && currentActivityId !== prevActivityRef.current && visibleStepIndices.length > 0 && currentStepIndex === 0) {
      const firstClassifiable = visibleStepIndices[0];
      if (firstClassifiable != null && firstClassifiable > 0) {
        setCurrentStepIndex(firstClassifiable);
      }
    }
    prevActivityRef.current = currentActivityId;
  }, [currentActivityId, visibleStepIndices, currentStepIndex, setCurrentStepIndex]);

  const visiblePosition = visibleStepIndices.indexOf(currentStepIndex);

  // Get current step
  const currentStep = steps[currentStepIndex] ?? null;
  const currentStepIsClassifiable = currentStep
    ? (currentStep.isClassifiable !== false &&
       !NON_CLASSIFIABLE_TYPES.includes(currentStep.stepType))
    : false;

  const processes = useMemo(() => tree?.processes ?? [], [tree]);

  // Find current activity node from tree
  const currentActivityNode = useMemo((): ActivityNode | null => {
    if (!currentActivityId) return null;
    for (const p of processes) {
      for (const f of p.flows) {
        for (const a of f.activities) {
          if (a.id === currentActivityId) return a;
        }
      }
    }
    return null;
  }, [processes, currentActivityId]);

  // Find breadcrumb context
  const breadcrumbContext = useMemo(() => {
    if (!currentActivityId) return null;
    for (const p of processes) {
      for (const f of p.flows) {
        for (const a of f.activities) {
          if (a.id === currentActivityId) {
            return { processName: p.name, flowName: f.name, activityTitle: a.title };
          }
        }
      }
    }
    return null;
  }, [processes, currentActivityId]);

  // All activity IDs in order
  const allActivityIds = useMemo(() => {
    return processes.flatMap((p) => p.flows.flatMap((f) => f.activities.map((a) => a.id)));
  }, [processes]);

  const currentActivityIndex = currentActivityId ? allActivityIds.indexOf(currentActivityId) : -1;
  const hasNextActivity = currentActivityIndex >= 0 && currentActivityIndex < allActivityIds.length - 1;

  // Steps ref for stable callbacks
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  // Activity completion check
  const activityComplete = useMemo(() => {
    if (!currentStep || steps.length === 0) return false;
    const classifiableSteps = steps.filter((s) =>
      s.isClassifiable !== false &&
      !["LOGON", "LOGOFF", "ACCESS_APP", "INFORMATION", "NAVIGATION"].includes(s.stepType),
    );
    return classifiableSteps.length > 0 && classifiableSteps.every((s) => s.fitStatus !== "PENDING");
  }, [steps, currentStep]);

  // Show completion card when at the end and all done
  const showCompletionCard = activityComplete && currentStepIndex >= steps.length - 1;

  // Handle response change
  const handleResponseChange = useCallback(
    async (stepId: string, data: { fitStatus: string; clientNote?: string | undefined; currentProcess?: string | undefined; confidence?: string | undefined; evidenceUrls?: string[] | undefined }) => {
      setLocalStepOverrides((prev) => {
        const next = new Map(prev);
        next.set(stepId, {
          fitStatus: data.fitStatus,
          clientNote: data.clientNote ?? stepsRef.current.find((s) => s.id === stepId)?.clientNote ?? null,
          currentProcess: data.currentProcess ?? stepsRef.current.find((s) => s.id === stepId)?.currentProcess ?? null,
          confidence: (data.confidence ?? stepsRef.current.find((s) => s.id === stepId)?.confidence ?? null) as string | null,
        });
        return next;
      });

      try {
        await fetch(`/api/assessments/${assessmentId}/steps/${stepId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch {
        // Retry silently
      }

      // Auto-advance (skip non-classifiable steps)
      const oldStep = stepsRef.current.find((s) => s.id === stepId);
      if (oldStep?.fitStatus === "PENDING" && data.fitStatus !== "PENDING") {
        setTimeout(() => {
          const nextIdx = stepsRef.current.findIndex(
            (s, i) =>
              i > currentStepIndex &&
              s.fitStatus === "PENDING" &&
              s.isClassifiable !== false &&
              !NON_CLASSIFIABLE_TYPES.includes(s.stepType),
          );
          if (nextIdx >= 0) {
            setCurrentStepIndex(nextIdx);
          } else {
            // Find next visible step
            const curVisPos = visibleStepIndices.indexOf(currentStepIndex);
            const nextVis = visibleStepIndices[curVisPos + 1];
            if (nextVis != null) setCurrentStepIndex(nextVis);
          }
        }, 200);
      }
    },
    [assessmentId, currentStepIndex, setCurrentStepIndex, visibleStepIndices],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        e.preventDefault();
        goToMap();
        return;
      }

      if (e.key === "Tab" && !e.shiftKey && view === "step") {
        // Next unreviewed activity
        e.preventDefault();
        const nextActIdx = allActivityIds.findIndex(
          (id, i) => i > currentActivityIndex && id !== currentActivityId,
        );
        if (nextActIdx >= 0) selectActivity(allActivityIds[nextActIdx]!);
        return;
      }

      if (e.key === "Tab" && e.shiftKey && view === "step") {
        // Prev activity
        e.preventDefault();
        if (currentActivityIndex > 0) selectActivity(allActivityIds[currentActivityIndex - 1]!);
        return;
      }

      if (view === "step") {
        const curVis = visibleStepIndices.indexOf(currentStepIndex);
        const prevVisIdx = curVis > 0 ? visibleStepIndices[curVis - 1] : undefined;
        const nextVisIdx = curVis >= 0 && curVis < visibleStepIndices.length - 1 ? visibleStepIndices[curVis + 1] : undefined;

        if (e.key === "ArrowLeft" && prevVisIdx != null) {
          setCurrentStepIndex(prevVisIdx);
        } else if (e.key === "ArrowRight" && nextVisIdx != null) {
          setCurrentStepIndex(nextVisIdx);
        } else if (e.key === "Home") {
          e.preventDefault();
          setCurrentStepIndex(visibleStepIndices[0] ?? 0);
        } else if (e.key === "End") {
          e.preventDefault();
          setCurrentStepIndex(visibleStepIndices[visibleStepIndices.length - 1] ?? steps.length - 1);
        } else if (e.key === "[") {
          // Prev activity
          e.preventDefault();
          if (currentActivityIndex > 0) selectActivity(allActivityIds[currentActivityIndex - 1]!);
        } else if (e.key === "]") {
          // Next activity
          e.preventDefault();
          if (hasNextActivity) selectActivity(allActivityIds[currentActivityIndex + 1]!);
        }

        // Classification shortcuts
        if (isReadOnly || !currentStep || !currentStepIsClassifiable) return;
        const keyMap: Record<string, string> = { f: "FIT", c: "CONFIGURE", g: "GAP", n: "NA" };
        const status = keyMap[e.key.toLowerCase()];
        if (status) {
          e.preventDefault();
          void handleResponseChange(currentStep.id, { fitStatus: status });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    view, currentStepIndex, steps.length, currentStep, currentStepIsClassifiable,
    isReadOnly, handleResponseChange, goToMap, selectActivity,
    allActivityIds, currentActivityId, currentActivityIndex, hasNextActivity, setCurrentStepIndex,
    visibleStepIndices,
  ]);

  // Bulk mark ALL steps across ALL scope items as FIT
  const handleAcceptAllStandard = useCallback(async () => {
    const totalPending = overallProgress.pending;
    const confirmed = window.confirm(
      `Accept All SAP Standard?\n\nThis will mark ${totalPending} unreviewed steps across ALL scope items as FIT (standard).\n\nThis is the right choice if your company wants to adopt SAP best practices as-is with no customization.\n\nYou can change individual steps later if needed.`,
    );
    if (!confirmed) return;

    setBulkAllLoading(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/steps/bulk-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setBulkAllLoading(false);
    }
  }, [assessmentId, overallProgress.pending]);

  // Mode-aware activity selection: in questions mode scroll to card, in steps mode navigate
  const handleActivitySelect = useCallback(
    (activityId: string) => {
      if (reviewMode === "questions") {
        // Switch to activity view and scroll to the card
        setView("activity");
        setTimeout(() => {
          const el = document.getElementById(`activity-${activityId}`);
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      } else {
        selectActivity(activityId);
      }
    },
    [reviewMode, setView, selectActivity],
  );

  // Auto-expand step implications when arriving at a classified step
  useEffect(() => {
    const step = stepsRef.current[currentStepIndex];
    setStepImplicationsExpanded(!!step && step.fitStatus !== "PENDING");
  }, [currentStepIndex]);

  // Reset when scope item changes
  useEffect(() => {
    setLocalStepOverrides(new Map());
    goToMap();
  }, [currentScopeItemId, goToMap]);

  // Activity steps as StepInGroup for ActivityPanel
  const stepsInGroup: StepInGroup[] = useMemo(() =>
    steps.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      actionTitle: s.actionTitle,
      stepType: s.stepType,
      activityTitle: s.activityTitle,
      fitStatus: s.fitStatus,
      isClassifiable: s.isClassifiable !== false,
      stepCategory: (s.stepCategory ?? "BUSINESS_PROCESS") as import("@/types/assessment").StepCategory,
    })),
  [steps]);

  // Scope item metadata for questions mode
  const scopeItemMeta = useMemo(
    () => (currentScopeItemId ? getScopeItemMetadata(currentScopeItemId) : null),
    [currentScopeItemId],
  );

  // All scope-item steps for questions mode (fetched once across all activities)
  const { data: allScopeStepsData } = useQuery({
    queryKey: ["all-scope-steps", currentScopeItemId, assessmentId],
    queryFn: async () => {
      const [catalogRes, responsesRes] = await Promise.all([
        fetchJson<{ data: StepData[] }>(
          `/api/catalog/scope-items/${currentScopeItemId}/steps?limit=1500`,
        ),
        fetchJson<{ data: Array<{ processStepId: string; fitStatus: string; clientNote: string | null; currentProcess: string | null; confidence?: string | null }> }>(
          `/api/assessments/${assessmentId}/steps?scopeItemId=${currentScopeItemId}&limit=1500`,
        ),
      ]);
      // Merge catalog with responses
      const responseMap = new Map<string, { fitStatus: string; clientNote: string | null; currentProcess: string | null; confidence?: string | null }>();
      for (const r of responsesRes.data) {
        responseMap.set(r.processStepId, r);
      }
      return catalogRes.data.map((step) => {
        const response = responseMap.get(step.id);
        return {
          ...step,
          fitStatus: response?.fitStatus ?? "PENDING",
          clientNote: response?.clientNote ?? null,
          currentProcess: response?.currentProcess ?? null,
          confidence: (response?.confidence ?? null) as string | null,
        };
      });
    },
    enabled: !!currentScopeItemId && reviewMode === "questions",
    staleTime: 60 * 1000,
  });

  // All activities from the tree for questions mode
  const allActivitiesFlat = useMemo(() => {
    if (!tree) return [];
    const result: { activity: ActivityNode; processName: string; flowName: string }[] = [];
    for (const p of tree.processes) {
      for (const f of p.flows) {
        for (const a of f.activities) {
          result.push({ activity: a, processName: p.name, flowName: f.name });
        }
      }
    }
    return result;
  }, [tree]);

  // Steps grouped by activity for questions mode, incorporating local overrides
  const allStepsMerged = useMemo(() => {
    if (!allScopeStepsData) return [];
    return allScopeStepsData.map((step) => {
      const override = localStepOverrides.get(step.id);
      if (!override) return step;
      return {
        ...step,
        fitStatus: override.fitStatus ?? step.fitStatus,
        clientNote: override.clientNote ?? step.clientNote,
        currentProcess: override.currentProcess ?? step.currentProcess,
        confidence: (override.confidence ?? step.confidence) as string | null,
      };
    });
  }, [allScopeStepsData, localStepOverrides]);

  // Map from activityId → steps for questions mode
  const stepsByActivityId = useMemo(() => {
    const map = new Map<string, StepData[]>();
    for (const step of allStepsMerged) {
      const actId = step.activityId ?? "unknown";
      const existing = map.get(actId);
      if (existing) {
        existing.push(step);
      } else {
        map.set(actId, [step]);
      }
    }
    return map;
  }, [allStepsMerged]);

  // Handle activity-level classification (bulk cascade to all child steps)
  const handleActivityClassify = useCallback(
    async (activityId: string, fitStatus: string, note?: string) => {
      if (!currentScopeItemId) return;

      // Get all classifiable step IDs for this activity
      const actSteps = stepsByActivityId.get(activityId) ?? [];
      const classifiableIds = actSteps
        .filter(
          (s) =>
            s.isClassifiable !== false &&
            !["LOGON", "LOGOFF", "ACCESS_APP", "INFORMATION", "NAVIGATION"].includes(s.stepType),
        )
        .map((s) => s.id);

      if (classifiableIds.length === 0) return;

      // Optimistic update: set local overrides for all classifiable steps
      setLocalStepOverrides((prev) => {
        const next = new Map(prev);
        for (const stepId of classifiableIds) {
          next.set(stepId, {
            fitStatus,
            clientNote: note ?? null,
          });
        }
        return next;
      });

      // Use the bulk API to persist
      try {
        const res = await fetch(`/api/assessments/${assessmentId}/steps/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scopeItemId: currentScopeItemId,
            fitStatus,
            stepIds: classifiableIds,
            clientNote: note,
          }),
        });

        // Phase: Dependency Engine — capture propagation effects
        if (dependencyEngineEnabled && res.ok) {
          try {
            const json = await res.json();
            if (json.dependencyEffects) {
              setDependencyEffectsMap((prev) => {
                const next = new Map(prev);
                next.set(activityId, json.dependencyEffects as DependencyEffects);
                return next;
              });
            }
          } catch {
            // Response already consumed or no dependency effects
          }
        }

        // Invalidate step responses to pick up server state
        void queryClient.invalidateQueries({
          queryKey: ["step-responses", assessmentId, currentScopeItemId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["all-scope-steps", currentScopeItemId, assessmentId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["hierarchy-progress", assessmentId, currentScopeItemId],
        });
      } catch {
        // Optimistic update stays; next fetch will reconcile
      }
    },
    [assessmentId, currentScopeItemId, stepsByActivityId, queryClient, dependencyEngineEnabled],
  );

  // Step-level implications panel state (TASK 6)
  const [stepImplicationsExpanded, setStepImplicationsExpanded] = useState(false);

  const currentScopeItem = scopeItems.find((i) => i.id === currentScopeItemId);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="hidden sm:flex sm:w-[280px] shrink-0 bg-card border-r border-border flex-col h-screen sticky top-0 overflow-hidden">
        {/* Section 1: Current Scope Item */}
        <div className="p-4 border-b">
          <Link
            href={`/assessment/${assessmentId}/scope`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Scope
          </Link>

          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Scope Item</p>

          {currentScopeItem && (
            <div className="mb-2">
              <p className="text-[15px] font-semibold text-foreground truncate" title={currentScopeItem.nameClean}>
                {currentScopeItem.nameClean}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {currentScopeItem.reviewedSteps} of {currentScopeItem.totalSteps} steps reviewed ({currentScopeItem.totalSteps > 0 ? Math.round((currentScopeItem.reviewedSteps / currentScopeItem.totalSteps) * 100) : 0}%)
              </p>
              <div className="h-1.5 rounded-full bg-slate-100 mt-1.5">
                <div
                  className="h-1.5 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${currentScopeItem.totalSteps > 0 ? Math.round((currentScopeItem.reviewedSteps / currentScopeItem.totalSteps) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Global progress (secondary, smaller) */}
          <div className="pt-2 border-t border-dashed">
            <div className="flex justify-between text-[10px] text-muted-foreground/60">
              <span>Overall assessment</span>
              <span>{overallProgress.reviewedSteps}/{overallProgress.totalSteps}</span>
            </div>
            <div className="h-1 rounded-full bg-slate-100 mt-1">
              <div
                className="h-1 rounded-full bg-blue-500/30 transition-all"
                style={{ width: `${overallProgress.totalSteps > 0 ? Math.round((overallProgress.reviewedSteps / overallProgress.totalSteps) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Section 2: Hierarchy tree */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 pt-3 pb-1">Hierarchy</p>
          {tree ? (
            <HierarchyTreeSidebar
              tree={tree}
              currentActivityId={currentActivityId}
              progressMap={progressMap}
              onActivitySelect={handleActivitySelect}
            />
          ) : (
            <div className="p-4 text-xs text-muted-foreground">Loading hierarchy...</div>
          )}
        </div>

        {/* Section 3: Other Scope Items */}
        <div className="border-t max-h-[200px] overflow-y-auto overscroll-contain">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-3 pb-1">Other Scope Items</p>
          {scopeItems.filter((item) => item.id !== currentScopeItemId).map((item) => {
            const pct = item.totalSteps > 0 ? Math.round((item.reviewedSteps / item.totalSteps) * 100) : 0;
            const badgeClass = pct === 100
              ? "bg-green-100 text-green-700"
              : pct >= 50
                ? "bg-blue-100 text-blue-700"
                : pct > 0
                  ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-500";
            return (
              <button
                key={item.id}
                onClick={() => setCurrentScopeItemId(item.id)}
                className="w-full text-left px-4 py-2 hover:bg-accent transition-colors flex items-center gap-2"
              >
                <p className="text-xs font-medium text-foreground truncate flex-1" title={item.nameClean}>{item.nameClean}</p>
                <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${badgeClass}`}>
                  {pct}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 p-4 sm:p-8 overflow-y-auto overscroll-contain">
        <div className="max-w-3xl mx-auto">
          {/* Mobile nav */}
          <div className="sm:hidden mb-4 flex items-center gap-2">
            {tree && (
              <MobileHierarchySheet
                tree={tree}
                currentActivityId={currentActivityId}
                progressMap={progressMap}
                onActivitySelect={handleActivitySelect}
                open={mobileSheetOpen}
                onOpenChange={setMobileSheetOpen}
              />
            )}
            <span className="text-sm font-medium truncate">{currentScopeItem?.nameClean}</span>
          </div>

          {/* Breadcrumb */}
          {view !== "map" && tree && breadcrumbContext && (
            <div className="mb-4">
              <HierarchyBreadcrumb
                scopeItemName={tree.scopeItemName}
                processName={breadcrumbContext.processName}
                flowName={breadcrumbContext.flowName}
                activityTitle={breadcrumbContext.activityTitle}
                onScopeClick={goToMap}
              />
            </div>
          )}

          {/* Map view — REM-19: scope item summary above process map */}
          {view === "map" && tree && (
            <>
              <ScopeItemSummary
                scopeItemId={currentScopeItem?.id ?? ""}
                scopeItemName={currentScopeItem?.nameClean ?? tree.scopeItemName}
                tree={tree}
                classifiableProgress={classifiableProgress}
              />
              <ProcessMap tree={tree} onActivitySelect={handleActivitySelect} />
            </>
          )}

          {/* Review mode toggle — shown when in step/activity view */}
          {view !== "map" && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="inline-flex rounded-lg border bg-muted p-0.5">
                  <button
                    onClick={() => {
                      setReviewMode("questions");
                      if (view === "step") setView("activity");
                    }}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      reviewMode === "questions"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Business Questions
                  </button>
                  <button
                    onClick={() => {
                      setReviewMode("steps");
                      if (view === "activity") setView("step");
                    }}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                      reviewMode === "steps"
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Detailed Steps
                  </button>
                </div>
                {reviewMode === "questions" && (
                  <span className="text-xs text-muted-foreground">
                    {allActivitiesFlat.length} activit{allActivitiesFlat.length !== 1 ? "ies" : "y"}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground/60 -mt-2 mb-2">
                {reviewMode === "questions"
                  ? "Answer one question per business process. Faster for business stakeholders."
                  : "Review each SAP step individually. More control for consultants."}
              </p>
            </>
          )}

          {/* Questions mode — activity-level review cards */}
          {view !== "map" && reviewMode === "questions" && tree && (() => {
            const PRELIM_PATTERNS = [
              /additional information/i,
              /preliminary steps/i,
              /test procedures/i,
              /^BRF\+/i,
              /eDocument.*prelim/i,
              /appendix/i,
            ];
            const isPreliminary = (title: string) =>
              PRELIM_PATTERNS.some((p) => p.test(title));

            const businessActivities = allActivitiesFlat.filter(
              ({ activity }) => !isPreliminary(activity.title),
            );
            const technicalActivities = allActivitiesFlat.filter(
              ({ activity }) => isPreliminary(activity.title),
            );

            const renderActivityCards = (
              items: typeof allActivitiesFlat,
              trackFlowKey: { current: string },
            ) =>
              items.map(({ activity, processName, flowName }) => {
                const actSteps = stepsByActivityId.get(activity.id) ?? [];
                const actMeta = currentScopeItemId
                  ? getActivityMetadata(currentScopeItemId, activity.title)
                  : null;
                const flowKey = `${processName}::${flowName}`;
                const showFlowHeading = flowKey !== trackFlowKey.current;
                trackFlowKey.current = flowKey;

                return (
                  <div key={activity.id}>
                    {showFlowHeading && (() => {
                      const displayProcess = processName.startsWith("__") ? null : processName;
                      const displayFlow = flowName.startsWith("__") ? null : flowName;
                      const label = [displayProcess, displayFlow].filter(Boolean).join(" \u203A ");
                      if (!label) return null;
                      return (
                        <div className="mb-2 mt-4 first:mt-0">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {label}
                          </p>
                        </div>
                      );
                    })()}

                    <BusinessQuestionCard
                      activity={activity}
                      steps={actSteps}
                      configs={configs}
                      scopeItemId={currentScopeItemId ?? ""}
                      assessmentId={assessmentId}
                      currentUserId=""
                      activityMetadata={actMeta}
                      scopeItemMetadata={scopeItemMeta}
                      implications={scopeItemMeta?.defaultImplications ?? null}
                      onActivityClassify={handleActivityClassify}
                      isReadOnly={isReadOnly}
                    />
                    {dependencyEngineEnabled && dependencyEffectsMap.has(activity.id) && (
                      <div className="mt-2">
                        <DependencyEffectsPanel
                          effects={dependencyEffectsMap.get(activity.id)!}
                        />
                      </div>
                    )}
                  </div>
                );
              });

            const flowKeyTracker = { current: "" };

            return (
              <div className="space-y-4">
                {businessActivities.length > 0 && (
                  <>
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Business Process Questions ({businessActivities.length})
                    </h3>
                    {renderActivityCards(businessActivities, flowKeyTracker)}
                  </>
                )}

                {technicalActivities.length > 0 && (
                  <details className="mt-6">
                    <summary className="text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                      Technical Setup &amp; Configuration ({technicalActivities.length} items)
                      <span className="text-xs text-muted-foreground/60 ml-2">
                        — Typically handled by your implementation team
                      </span>
                    </summary>
                    <div className="mt-3 space-y-4 opacity-75">
                      {renderActivityCards(technicalActivities, { current: "" })}
                    </div>
                  </details>
                )}
              </div>
            );
          })()}

          {/* Step review view */}
          {view === "step" && reviewMode === "steps" && currentActivityId && (
            <>
              {stepsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : showCompletionCard && currentActivityNode ? (
                <ActivityCompletionCard
                  activityTitle={currentActivityNode.title}
                  fitCount={stepsInGroup.filter((s) => s.fitStatus === "FIT").length}
                  configureCount={stepsInGroup.filter((s) => s.fitStatus === "CONFIGURE").length}
                  gapCount={stepsInGroup.filter((s) => s.fitStatus === "GAP").length}
                  naCount={stepsInGroup.filter((s) => s.fitStatus === "NA").length}
                  onBack={goToMap}
                  onContinue={() => {
                    if (hasNextActivity) selectActivity(allActivityIds[currentActivityIndex + 1]!);
                  }}
                  hasNextActivity={hasNextActivity}
                />
              ) : currentStep ? (
                <>
                  {/* Step header */}
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-foreground">
                      {currentScopeItem?.nameClean}
                    </h2>
                    {!isReadOnly && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleAcceptAllStandard}
                        disabled={bulkAllLoading || overallProgress.pending === 0}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {bulkAllLoading ? "Marking..." : "\u2713 Accept All SAP Standard"}
                      </Button>
                    )}
                  </div>

                  {/* Process Flow Overview */}
                  <ScopeFlowOverview
                    scopeItemName={currentScopeItem?.nameClean ?? ""}
                    steps={steps}
                    onFlowClick={(flowName) => {
                      const firstStep = steps.findIndex(s => s.solutionProcessFlowName === flowName);
                      if (firstStep >= 0) {
                        // Navigate to nearest visible step
                        const visIdx = visibleStepIndices.find(i => i >= firstStep);
                        setCurrentStepIndex(visIdx ?? firstStep);
                      }
                    }}
                  />

                  <div className="mb-4">
                    <ClassifiableProgressBar
                      totalClassifiable={classifiableProgress.totalClassifiable}
                      totalClassified={classifiableProgress.totalClassified}
                      totalSteps={classifiableProgress.totalSteps}
                      percentage={classifiableProgress.percentage}
                    />
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">
                        Step {(visiblePosition >= 0 ? visiblePosition : currentStepIndex) + 1} of {visibleStepIndices.length}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                        currentStep.fitStatus === "FIT" ? "bg-green-50 text-green-700 border border-green-200"
                        : currentStep.fitStatus === "CONFIGURE" ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : currentStep.fitStatus === "GAP" ? "bg-amber-50 text-amber-700 border border-amber-200"
                        : currentStep.fitStatus === "NA" ? "bg-slate-50 text-slate-500 border border-slate-200"
                        : "bg-slate-50 text-slate-500 border border-slate-200"
                      }`}>
                        {STATUS_DISPLAY_LABELS[currentStep.fitStatus] ?? currentStep.fitStatus}
                      </span>
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showAllSteps}
                        onChange={(e) => setShowAllSteps(e.target.checked)}
                        className="rounded border-border"
                      />
                      Show technical steps
                      {!showAllSteps && hiddenStepCount > 0 && (
                        <span className="text-muted-foreground/60">({hiddenStepCount} hidden)</span>
                      )}
                    </label>
                  </div>

                  {currentStepIsClassifiable ? (
                    <>
                      <StepReviewCard
                        step={currentStep}
                        configs={configs}
                        onResponseChange={handleResponseChange}
                        isReadOnly={isReadOnly}
                        isItLead={isItLead}
                        assessmentId={assessmentId}
                      />
                      {/* Step-level implications panel */}
                      {currentStep.fitStatus !== "PENDING" && currentScopeItemId && (
                        <div className="mt-3">
                          <ImplicationsPanel
                            fitStatus={currentStep.fitStatus}
                            scopeItemId={currentScopeItemId}
                            activityTitle={currentStep.activityTitle ?? ""}
                            activityMetadata={currentScopeItemId ? getActivityMetadata(currentScopeItemId, currentStep.activityTitle ?? "") : null}
                            scopeItemMetadata={scopeItemMeta}
                            implications={scopeItemMeta?.defaultImplications ?? null}
                            configs={configs}
                            isExpanded={stepImplicationsExpanded}
                            onToggle={() => setStepImplicationsExpanded((v) => !v)}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="bg-card rounded-lg border">
                      <ReferenceStepRow step={currentStep} />
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex items-center justify-between mt-6">
                    <Button
                      variant="outline"
                      onClick={() => {
                        const prev = visiblePosition > 0 ? visibleStepIndices[visiblePosition - 1] : undefined;
                        if (prev != null) setCurrentStepIndex(prev);
                      }}
                      disabled={visiblePosition <= 0}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <div className="hidden sm:flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Step {(visiblePosition >= 0 ? visiblePosition : currentStepIndex) + 1} of {visibleStepIndices.length}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowShortcuts(true)}
                        className="text-muted-foreground/60 px-2"
                        title="Keyboard shortcuts"
                      >
                        <span className="text-xs border rounded px-1.5 py-0.5">?</span>
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const next = visiblePosition >= 0 && visiblePosition < visibleStepIndices.length - 1 ? visibleStepIndices[visiblePosition + 1] : undefined;
                        if (next != null) setCurrentStepIndex(next);
                      }}
                      disabled={visiblePosition >= visibleStepIndices.length - 1}
                    >
                      Next
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  No steps found for this activity.
                </div>
              )}
            </>
          )}

          {/* Loading state */}
          {!tree && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Keyboard Shortcuts Overlay (REM-18) */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowShortcuts(false)}>
          <div className="bg-card rounded-xl shadow-2xl p-6 max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-foreground mb-4">Keyboard Shortcuts</h3>
            <div className="space-y-3">
              {([
                ["\u2190  \u2192", "Previous / Next step"],
                ["1 or F", "Mark as FIT (matches our process)"],
                ["2 or C", "Mark as CONFIGURE (needs configuration)"],
                ["3 or G", "Mark as GAP (our process is different)"],
                ["4 or N", "Mark as N/A (not applicable)"],
                ["Esc", "Return to process map"],
                ["[ / ]", "Previous / Next activity"],
                ["Tab", "Next activity"],
              ] as const).map(([key, desc]) => (
                <div key={key} className="flex items-center gap-3">
                  <kbd className="inline-flex items-center justify-center min-w-[36px] px-2 py-1 text-xs font-mono bg-muted border rounded text-foreground">
                    {key}
                  </kbd>
                  <span className="text-sm text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-6 w-full" onClick={() => setShowShortcuts(false)}>
              Got it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewShell(props: ReviewShellProps) {
  return (
    <HierarchyProvider>
      <ReviewShellInner {...props} />
    </HierarchyProvider>
  );
}
