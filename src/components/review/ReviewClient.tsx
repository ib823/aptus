"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepReviewCard } from "@/components/review/StepReviewCard";
import { ReferenceStepRow } from "@/components/review/ReferenceStepRow";
import { StepGroupSidebar } from "@/components/review/StepGroupSidebar";
import { ClassifiableProgressBar } from "@/components/review/ClassifiableProgressBar";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { groupSteps, computeClassifiableProgress } from "@/lib/assessment/step-grouper";

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
  solutionProcessFlowName: string | null;
  fitStatus: string;
  clientNote: string | null;
  currentProcess: string | null;
  stepCategory?: string | null;
  isClassifiable?: boolean | null;
  parsedContent?: Record<string, unknown> | null;
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

interface ReviewClientProps {
  assessmentId: string;
  assessmentStatus: string;
  userRole: string;
  scopeItems: ScopeItemNav[];
  initialProgress: OverallProgress;
}

export function ReviewClient({
  assessmentId,
  assessmentStatus,
  userRole,
  scopeItems: initialScopeItems,
  initialProgress,
}: ReviewClientProps) {
  const [scopeItems, setScopeItems] = useState(initialScopeItems);
  const [currentScopeItemId, setCurrentScopeItemId] = useState<string | null>(
    initialScopeItems[0]?.id ?? null,
  );
  const [steps, setSteps] = useState<StepData[]>([]);
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [loading, setLoading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(initialProgress);
  const [bulkLoading, setBulkLoading] = useState(false);

  const isReadOnly = assessmentStatus === "signed_off" || assessmentStatus === "reviewed";
  const isItLead = userRole === "it_lead";

  // Fetch steps when scope item changes
  useEffect(() => {
    if (!currentScopeItemId) return;

    let cancelled = false;
    setLoading(true);

    const fetchData = async () => {
      const [stepsRes, configsRes] = await Promise.all([
        fetch(`/api/catalog/scope-items/${currentScopeItemId}/steps?limit=200`),
        fetch(`/api/catalog/scope-items/${currentScopeItemId}/configs`),
      ]);

      if (cancelled) return;

      const stepsData = await stepsRes.json();
      const configsData = await configsRes.json();

      // Also fetch responses for these steps
      const responsesRes = await fetch(
        `/api/assessments/${assessmentId}/steps?scopeItemId=${currentScopeItemId}&limit=200`,
      );
      const responsesData = await responsesRes.json();

      if (cancelled) return;

      // Merge responses into steps
      const responseMap = new Map<string, { fitStatus: string; clientNote: string | null; currentProcess: string | null; confidence?: string | null }>();
      for (const r of responsesData.data ?? []) {
        responseMap.set(r.processStepId, {
          fitStatus: r.fitStatus,
          clientNote: r.clientNote,
          currentProcess: r.currentProcess,
          confidence: r.confidence ?? null,
        });
      }

      const mergedSteps = (stepsData.data as StepData[]).map((step: StepData) => {
        const response = responseMap.get(step.id);
        return {
          ...step,
          fitStatus: response?.fitStatus ?? "PENDING",
          clientNote: response?.clientNote ?? null,
          currentProcess: response?.currentProcess ?? null,
          confidence: response?.confidence ?? null,
        };
      });

      setSteps(mergedSteps);
      setConfigs(configsData.data ?? []);
      setCurrentStepIndex(0);
      setLoading(false);
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [currentScopeItemId, assessmentId]);

  // Group steps using the step grouper
  const stepGroups = useMemo(() => groupSteps(steps), [steps]);
  const classifiableProgress = useMemo(() => computeClassifiableProgress(stepGroups), [stepGroups]);

  // Visible steps: either all or classifiable only
  const visibleSteps = useMemo(() => {
    if (showAllSteps) return steps;
    return steps.filter((s) => {
      // Check isClassifiable from step data or infer
      if (s.isClassifiable === true) return true;
      if (s.isClassifiable === false) return false;
      // Fallback: non-classifiable types
      const nonClassifiableTypes = ["LOGON", "LOGOFF", "ACCESS_APP", "INFORMATION", "NAVIGATION"];
      return !nonClassifiableTypes.includes(s.stepType);
    });
  }, [steps, showAllSteps]);

  const currentStep = visibleSteps[currentStepIndex] ?? null;
  const currentStepIsClassifiable = currentStep
    ? (currentStep.isClassifiable !== false &&
       !["LOGON", "LOGOFF", "ACCESS_APP", "INFORMATION", "NAVIGATION"].includes(currentStep.stepType))
    : false;

  // Find active group for sidebar
  const activeGroupKey = useMemo(() => {
    if (!currentStep) return null;
    for (const group of stepGroups) {
      if (group.steps.some((s) => s.id === currentStep.id)) {
        return group.key;
      }
    }
    return null;
  }, [currentStep, stepGroups]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

      if (e.key === "ArrowLeft" && currentStepIndex > 0) {
        setCurrentStepIndex((i) => i - 1);
      } else if (e.key === "ArrowRight" && currentStepIndex < visibleSteps.length - 1) {
        setCurrentStepIndex((i) => i + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStepIndex, visibleSteps.length]);

  // Handle step click from sidebar
  const handleStepClick = useCallback(
    (stepId: string) => {
      const idx = visibleSteps.findIndex((s) => s.id === stepId);
      if (idx >= 0) {
        setCurrentStepIndex(idx);
      } else if (!showAllSteps) {
        // Step not visible — switch to show-all and find it
        setShowAllSteps(true);
        const allIdx = steps.findIndex((s) => s.id === stepId);
        if (allIdx >= 0) setCurrentStepIndex(allIdx);
      }
    },
    [visibleSteps, steps, showAllSteps],
  );

  // Handle group click from sidebar
  const handleGroupClick = useCallback(
    (groupKey: string) => {
      const group = stepGroups.find((g) => g.key === groupKey);
      if (group && group.steps.length > 0) {
        handleStepClick(group.steps[0]!.id);
      }
    },
    [stepGroups, handleStepClick],
  );

  // Handle response change
  const handleResponseChange = useCallback(
    async (stepId: string, data: { fitStatus: string; clientNote?: string | undefined; currentProcess?: string | undefined; confidence?: string | undefined }) => {
      // Optimistic update
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? {
                ...s,
                fitStatus: data.fitStatus,
                clientNote: data.clientNote ?? s.clientNote,
                currentProcess: data.currentProcess ?? s.currentProcess,
                confidence: (data.confidence ?? s.confidence) as string | null,
              }
            : s,
        ),
      );

      // Update sidebar counts optimistically
      if (currentScopeItemId) {
        setScopeItems((prev) =>
          prev.map((item) => {
            if (item.id !== currentScopeItemId) return item;
            const oldStep = steps.find((s) => s.id === stepId);
            const oldStatus = oldStep?.fitStatus ?? "PENDING";
            const newStatus = data.fitStatus;

            if (oldStatus === newStatus) return item;

            const updated = { ...item };
            if (oldStatus === "FIT") updated.fit--;
            else if (oldStatus === "CONFIGURE") updated.configure--;
            else if (oldStatus === "GAP") updated.gap--;
            else if (oldStatus === "NA") updated.na--;
            else if (oldStatus === "PENDING") updated.pending--;

            if (newStatus === "FIT") updated.fit++;
            else if (newStatus === "CONFIGURE") updated.configure++;
            else if (newStatus === "GAP") updated.gap++;
            else if (newStatus === "NA") updated.na++;
            else if (newStatus === "PENDING") updated.pending++;

            if (oldStatus === "PENDING" && newStatus !== "PENDING") {
              updated.reviewedSteps++;
            } else if (oldStatus !== "PENDING" && newStatus === "PENDING") {
              updated.reviewedSteps--;
            }

            return updated;
          }),
        );

        setOverallProgress((prev) => {
          const oldStep = steps.find((s) => s.id === stepId);
          const oldStatus = oldStep?.fitStatus ?? "PENDING";
          const newStatus = data.fitStatus;
          if (oldStatus === newStatus) return prev;

          const updated = { ...prev };
          if (oldStatus === "FIT") updated.fit--;
          else if (oldStatus === "CONFIGURE") updated.configure--;
          else if (oldStatus === "GAP") updated.gap--;
          else if (oldStatus === "NA") updated.na--;
          else if (oldStatus === "PENDING") updated.pending--;

          if (newStatus === "FIT") updated.fit++;
          else if (newStatus === "CONFIGURE") updated.configure++;
          else if (newStatus === "GAP") updated.gap++;
          else if (newStatus === "NA") updated.na++;
          else if (newStatus === "PENDING") updated.pending++;

          if (oldStatus === "PENDING" && newStatus !== "PENDING") {
            updated.reviewedSteps++;
          } else if (oldStatus !== "PENDING" && newStatus === "PENDING") {
            updated.reviewedSteps--;
          }

          return updated;
        });
      }

      // Persist
      try {
        await fetch(`/api/assessments/${assessmentId}/steps/${stepId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch {
        // Retry silently
      }
    },
    [assessmentId, currentScopeItemId, steps],
  );

  // Bulk mark remaining as FIT
  const handleBulkFit = useCallback(async () => {
    if (!currentScopeItemId || bulkLoading) return;

    const pendingSteps = steps.filter((s) => s.fitStatus === "PENDING");
    if (pendingSteps.length === 0) return;

    setBulkLoading(true);

    try {
      const res = await fetch(`/api/assessments/${assessmentId}/steps/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeItemId: currentScopeItemId,
          fitStatus: "FIT",
        }),
      });

      if (res.ok) {
        setSteps((prev) =>
          prev.map((s) =>
            s.fitStatus === "PENDING" ? { ...s, fitStatus: "FIT" } : s,
          ),
        );

        setScopeItems((prev) =>
          prev.map((item) => {
            if (item.id !== currentScopeItemId) return item;
            return {
              ...item,
              fit: item.fit + item.pending,
              pending: 0,
              reviewedSteps: item.totalSteps,
            };
          }),
        );
      }
    } finally {
      setBulkLoading(false);
    }
  }, [assessmentId, currentScopeItemId, steps, bulkLoading]);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — scope item picker + step group navigation */}
      <div className="hidden sm:flex sm:w-[300px] bg-muted/40 border-r border flex-col h-screen fixed left-0 top-0 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border">
          <Link
            href={`/assessment/${assessmentId}/scope`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Scope
          </Link>
          <ProgressBar value={overallProgress.reviewedSteps} max={overallProgress.totalSteps} />
          <p className="text-xs text-muted-foreground mt-1.5">
            {overallProgress.reviewedSteps} / {overallProgress.totalSteps} steps
            {overallProgress.classifiableSteps != null && (
              <> ({overallProgress.classifiableSteps} classifiable)</>
            )}
          </p>
        </div>

        {/* Scope item picker */}
        <div className="border-b border max-h-[200px] overflow-y-auto">
          {scopeItems.map((item) => {
            const percent = item.totalSteps > 0
              ? Math.round((item.reviewedSteps / item.totalSteps) * 100)
              : 0;

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
                <p className="text-xs font-medium text-foreground truncate">{item.nameClean}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1">
                    <div className="h-1 rounded-full bg-muted">
                      <div
                        className="h-1 rounded-full bg-blue-500 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">
                    {item.reviewedSteps}/{item.totalSteps}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Step group sidebar — grouped steps for current scope item */}
        <div className="flex-1 overflow-y-auto py-2 px-1">
          {loading ? (
            <div className="p-4 text-xs text-muted-foreground">Loading steps...</div>
          ) : (
            <StepGroupSidebar
              groups={stepGroups}
              activeGroupKey={activeGroupKey}
              activeStepId={currentStep?.id ?? null}
              onGroupClick={handleGroupClick}
              onStepClick={handleStepClick}
            />
          )}
        </div>

        {/* Footer — status summary */}
        <div className="p-3 border-t border">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setShowAllSteps(!showAllSteps)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAllSteps ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showAllSteps ? "Show all steps" : "Classifiable only"}
            </button>
          </div>
          <div className="space-y-1">
            <StatRow label="FIT" count={overallProgress.fit} color="bg-green-500" />
            <StatRow label="CONFIGURE" count={overallProgress.configure} color="bg-blue-500" />
            <StatRow label="GAP" count={overallProgress.gap} color="bg-amber-500" />
            <StatRow label="N/A" count={overallProgress.na} color="bg-muted-foreground/60" />
            <StatRow label="PENDING" count={overallProgress.pending} color="bg-muted" />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="sm:ml-[300px] flex-1 p-8">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !currentStep ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-12 h-12 text-muted-foreground/60 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground">
                {visibleSteps.length === 0 ? "No steps to review" : "Select a scope item"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {visibleSteps.length === 0
                  ? "Select a scope item from the sidebar to begin reviewing."
                  : "Choose a scope item from the sidebar to start."}
              </p>
            </div>
          ) : (
            <>
              {/* Step navigation header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {scopeItems.find((i) => i.id === currentScopeItemId)?.nameClean}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {!isReadOnly && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBulkFit}
                      disabled={bulkLoading || steps.filter((s) => s.fitStatus === "PENDING").length === 0}
                    >
                      {bulkLoading ? "Marking..." : "Mark remaining as FIT"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Classifiable progress bar */}
              <div className="mb-4">
                <ClassifiableProgressBar
                  totalClassifiable={classifiableProgress.totalClassifiable}
                  totalClassified={classifiableProgress.totalClassified}
                  totalSteps={classifiableProgress.totalSteps}
                  percentage={classifiableProgress.percentage}
                />
              </div>

              {/* Step picker dots */}
              <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2">
                {visibleSteps.map((step, i) => {
                  const color = step.fitStatus === "FIT" ? "bg-green-500"
                    : step.fitStatus === "CONFIGURE" ? "bg-blue-500"
                    : step.fitStatus === "GAP" ? "bg-amber-500"
                    : step.fitStatus === "NA" ? "bg-muted-foreground/60"
                    : "bg-muted";

                  return (
                    <button
                      key={step.id}
                      onClick={() => setCurrentStepIndex(i)}
                      className={`w-3 h-3 rounded-full shrink-0 transition-all ${color} ${
                        i === currentStepIndex ? "ring-2 ring-offset-1 ring-blue-500" : ""
                      }`}
                      aria-label={`Step ${i + 1}: ${step.actionTitle}`}
                    />
                  );
                })}
              </div>

              {/* Current step — classifiable or reference */}
              {currentStepIsClassifiable ? (
                <StepReviewCard
                  step={currentStep}
                  configs={configs}
                  onResponseChange={handleResponseChange}
                  isReadOnly={isReadOnly}
                  isItLead={isItLead}
                />
              ) : (
                <div className="bg-card rounded-lg border">
                  <ReferenceStepRow step={currentStep} />
                </div>
              )}

              {/* Navigation buttons */}
              <div className="flex items-center justify-between mt-6">
                <Button
                  variant="outline"
                  onClick={() => setCurrentStepIndex((i) => i - 1)}
                  disabled={currentStepIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <span className="hidden sm:inline text-sm text-muted-foreground">
                  Step {currentStepIndex + 1} of {visibleSteps.length} · Use ← → keys
                </span>
                <Button
                  variant="outline"
                  onClick={() => setCurrentStepIndex((i) => i + 1)}
                  disabled={currentStepIndex >= visibleSteps.length - 1}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="font-medium text-foreground">{count}</span>
    </div>
  );
}
