"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StepReviewCard } from "@/components/review/StepReviewCard";
import { ReferenceStepRow } from "@/components/review/ReferenceStepRow";
import { ClassifiableProgressBar } from "@/components/review/ClassifiableProgressBar";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { HierarchyProvider, useHierarchy } from "@/components/hierarchy/HierarchyContext";
import { HierarchyTreeSidebar } from "@/components/hierarchy/HierarchyTreeSidebar";
import { HierarchyBreadcrumb } from "@/components/hierarchy/HierarchyBreadcrumb";
import { ProcessMap } from "@/components/hierarchy/ProcessMap";
import { ActivityCompletionCard } from "@/components/hierarchy/ActivityCompletionCard";
import { MobileHierarchySheet } from "@/components/hierarchy/MobileHierarchySheet";
import { groupStepsByActivity, computeClassifiableProgress, type StepInGroup } from "@/lib/assessment/step-grouper";
import { ScopeFlowOverview } from "@/components/review/ScopeFlowOverview";
import { ScopeItemSummary } from "@/components/review/ScopeItemSummary";
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
    setTree,
    setProgressMap,
    selectActivity,
    setCurrentStepIndex,
    goToMap,
  } = useHierarchy();

  const [scopeItems] = useState(initialScopeItems);
  // REM-33: If initialScopeItemId is provided (from ?scopeItem= query param), use it
  const resolvedInitialId = initialScopeItemId && initialScopeItems.some((i) => i.id === initialScopeItemId)
    ? initialScopeItemId
    : initialScopeItems[0]?.id ?? null;
  const [currentScopeItemId, setCurrentScopeItemId] = useState<string | null>(resolvedInitialId);
  const [localStepOverrides, setLocalStepOverrides] = useState<Map<string, Partial<StepData>>>(new Map());
  const [overallProgress] = useState(initialProgress);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [bulkAllLoading, setBulkAllLoading] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

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

  // Get current step
  const currentStep = steps[currentStepIndex] ?? null;
  const currentStepIsClassifiable = currentStep
    ? (currentStep.isClassifiable !== false &&
       !["LOGON", "LOGOFF", "ACCESS_APP", "INFORMATION", "NAVIGATION"].includes(currentStep.stepType))
    : false;

  const processes = tree?.processes ?? [];

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

      // Auto-advance
      const oldStep = stepsRef.current.find((s) => s.id === stepId);
      if (oldStep?.fitStatus === "PENDING" && data.fitStatus !== "PENDING") {
        setTimeout(() => {
          const nextIdx = stepsRef.current.findIndex(
            (s, i) => i > currentStepIndex && s.fitStatus === "PENDING",
          );
          if (nextIdx >= 0) {
            setCurrentStepIndex(nextIdx);
          } else if (currentStepIndex < stepsRef.current.length - 1) {
            setCurrentStepIndex(currentStepIndex + 1);
          }
        }, 200);
      }
    },
    [assessmentId, currentStepIndex, setCurrentStepIndex],
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
        if (e.key === "ArrowLeft" && currentStepIndex > 0) {
          setCurrentStepIndex(currentStepIndex - 1);
        } else if (e.key === "ArrowRight" && currentStepIndex < steps.length - 1) {
          setCurrentStepIndex(currentStepIndex + 1);
        } else if (e.key === "Home") {
          e.preventDefault();
          setCurrentStepIndex(0);
        } else if (e.key === "End") {
          e.preventDefault();
          setCurrentStepIndex(steps.length - 1);
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

  const currentScopeItem = scopeItems.find((i) => i.id === currentScopeItemId);

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="hidden sm:flex sm:w-[280px] shrink-0 bg-muted/40 border-r flex-col h-screen sticky top-0 overflow-hidden">
        {/* Header — REM-21: per-scope-item progress */}
        <div className="p-4 border-b">
          <Link
            href={`/assessment/${assessmentId}/scope`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Scope
          </Link>

          {/* Current scope item progress (prominent) */}
          {currentScopeItem && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-foreground truncate" title={currentScopeItem.nameClean}>
                {currentScopeItem.nameClean}
              </p>
              <ProgressBar value={currentScopeItem.reviewedSteps} max={currentScopeItem.totalSteps} />
              <p className="text-xs text-muted-foreground mt-1">
                {currentScopeItem.reviewedSteps} / {currentScopeItem.totalSteps} steps in this scope item
              </p>
            </div>
          )}

          {/* Global progress (secondary, smaller) */}
          <div className="pt-2 border-t border-dashed">
            <div className="flex justify-between text-[10px] text-muted-foreground/60">
              <span>Overall assessment</span>
              <span>{overallProgress.reviewedSteps}/{overallProgress.totalSteps}</span>
            </div>
            <div className="h-1 rounded-full bg-muted mt-1">
              <div
                className="h-1 rounded-full bg-muted-foreground/30 transition-all"
                style={{ width: `${overallProgress.totalSteps > 0 ? Math.round((overallProgress.reviewedSteps / overallProgress.totalSteps) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Scope items */}
        <div className="border-b max-h-[160px] overflow-y-auto overscroll-contain">
          {scopeItems.map((item) => {
            const pct = item.totalSteps > 0 ? Math.round((item.reviewedSteps / item.totalSteps) * 100) : 0;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentScopeItemId(item.id)}
                className={`w-full text-left px-4 py-2 transition-colors ${
                  currentScopeItemId === item.id
                    ? "bg-card border-l-2 border-blue-500"
                    : "hover:bg-accent border-l-2 border-transparent"
                }`}
              >
                <p className="text-xs font-medium text-foreground truncate" title={item.nameClean}>{item.nameClean}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1 rounded-full bg-muted">
                    <div className="h-1 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">{item.reviewedSteps}/{item.totalSteps}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Hierarchy tree */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {tree ? (
            <HierarchyTreeSidebar
              tree={tree}
              currentActivityId={currentActivityId}
              progressMap={progressMap}
              onActivitySelect={selectActivity}
            />
          ) : (
            <div className="p-4 text-xs text-muted-foreground">Loading hierarchy...</div>
          )}
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
                onActivitySelect={selectActivity}
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
              <ProcessMap tree={tree} onActivitySelect={selectActivity} />
            </>
          )}

          {/* Step review view */}
          {view === "step" && currentActivityId && (
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
                      if (firstStep >= 0) setCurrentStepIndex(firstStep);
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

                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-sm font-medium text-foreground">
                      Step {currentStepIndex + 1} of {steps.length}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                      currentStep.fitStatus === "FIT" ? "bg-green-100 text-green-700"
                      : currentStep.fitStatus === "CONFIGURE" ? "bg-blue-100 text-blue-700"
                      : currentStep.fitStatus === "GAP" ? "bg-amber-100 text-amber-700"
                      : currentStep.fitStatus === "NA" ? "bg-gray-100 text-gray-600"
                      : "bg-muted text-muted-foreground"
                    }`}>
                      {currentStep.fitStatus === "PENDING" ? "Unreviewed" : currentStep.fitStatus}
                    </span>
                  </div>

                  {currentStepIsClassifiable ? (
                    <StepReviewCard
                      step={currentStep}
                      configs={configs}
                      onResponseChange={handleResponseChange}
                      isReadOnly={isReadOnly}
                      isItLead={isItLead}
                      assessmentId={assessmentId}
                    />
                  ) : (
                    <div className="bg-card rounded-lg border">
                      <ReferenceStepRow step={currentStep} />
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex items-center justify-between mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentStepIndex(currentStepIndex - 1)}
                      disabled={currentStepIndex === 0}
                    >
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Previous
                    </Button>
                    <span className="hidden sm:inline text-sm text-muted-foreground">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowShortcuts(true)}
                        className="text-muted-foreground px-2"
                        title="Keyboard shortcuts"
                      >
                        <span className="text-xs border rounded px-1.5 py-0.5">?</span>
                      </Button>
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => setCurrentStepIndex(currentStepIndex + 1)}
                      disabled={currentStepIndex >= steps.length - 1}
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
