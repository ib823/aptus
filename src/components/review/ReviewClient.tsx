"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReviewSidebar } from "@/components/review/ReviewSidebar";
import { StepReviewCard } from "@/components/review/StepReviewCard";

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
}

interface ConfigItem {
  id: string;
  configItemName: string;
  category: string;
  selfService: boolean;
}

interface OverallProgress {
  totalSteps: number;
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
  const [hideRepetitive, setHideRepetitive] = useState(false);
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
      const hideParam = hideRepetitive ? "&hideRepetitive=true" : "";
      const [stepsRes, configsRes] = await Promise.all([
        fetch(`/api/catalog/scope-items/${currentScopeItemId}/steps?limit=200${hideParam}`),
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
      const responseMap = new Map<string, { fitStatus: string; clientNote: string | null; currentProcess: string | null }>();
      for (const r of responsesData.data ?? []) {
        responseMap.set(r.processStepId, {
          fitStatus: r.fitStatus,
          clientNote: r.clientNote,
          currentProcess: r.currentProcess,
        });
      }

      const mergedSteps = (stepsData.data as StepData[]).map((step: StepData) => {
        const response = responseMap.get(step.id);
        return {
          ...step,
          fitStatus: response?.fitStatus ?? "PENDING",
          clientNote: response?.clientNote ?? null,
          currentProcess: response?.currentProcess ?? null,
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
  }, [currentScopeItemId, assessmentId, hideRepetitive]);

  // Visible steps (after filtering)
  const visibleSteps = useMemo(() => {
    return steps;
  }, [steps]);

  const currentStep = visibleSteps[currentStepIndex] ?? null;

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

  // Handle response change — save immediately for fitStatus, debounced for text
  const handleResponseChange = useCallback(
    async (stepId: string, data: { fitStatus: string; clientNote?: string | undefined; currentProcess?: string | undefined }) => {
      // Optimistic update
      setSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? {
                ...s,
                fitStatus: data.fitStatus,
                clientNote: data.clientNote ?? s.clientNote,
                currentProcess: data.currentProcess ?? s.currentProcess,
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
            // Decrement old
            if (oldStatus === "FIT") updated.fit--;
            else if (oldStatus === "CONFIGURE") updated.configure--;
            else if (oldStatus === "GAP") updated.gap--;
            else if (oldStatus === "NA") updated.na--;
            else if (oldStatus === "PENDING") updated.pending--;

            // Increment new
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

        // Update overall progress optimistically
        setOverallProgress((prev) => {
          const oldStep = steps.find((s) => s.id === stepId);
          const oldStatus = oldStep?.fitStatus ?? "PENDING";
          const newStatus = data.fitStatus;
          if (oldStatus === newStatus) return prev;

          const updated = { ...prev };
          // Decrement old
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
        // Update local state
        setSteps((prev) =>
          prev.map((s) =>
            s.fitStatus === "PENDING" ? { ...s, fitStatus: "FIT" } : s,
          ),
        );

        // Refresh sidebar counts
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
      <ReviewSidebar
        assessmentId={assessmentId}
        scopeItems={scopeItems}
        currentScopeItemId={currentScopeItemId}
        onSelectScopeItem={setCurrentScopeItemId}
        overallProgress={overallProgress}
        hideRepetitive={hideRepetitive}
        onToggleRepetitive={() => setHideRepetitive(!hideRepetitive)}
      />

      {/* Main content */}
      <div className="sm:ml-[280px] flex-1 p-8">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !currentStep ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-950">
                {visibleSteps.length === 0 ? "No steps to review" : "Select a scope item"}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {visibleSteps.length === 0
                  ? "Select a scope item from the sidebar to begin reviewing."
                  : "Choose a scope item from the sidebar to start."}
              </p>
            </div>
          ) : (
            <>
              {/* Step navigation header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-950">
                    {scopeItems.find((i) => i.id === currentScopeItemId)?.nameClean}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Step {currentStepIndex + 1} of {visibleSteps.length}
                  </p>
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

              {/* Step picker dots */}
              <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2">
                {visibleSteps.map((step, i) => {
                  const color = step.fitStatus === "FIT" ? "bg-green-500"
                    : step.fitStatus === "CONFIGURE" ? "bg-blue-500"
                    : step.fitStatus === "GAP" ? "bg-amber-500"
                    : step.fitStatus === "NA" ? "bg-gray-300"
                    : "bg-gray-200";

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

              {/* Current step card */}
              <StepReviewCard
                step={currentStep}
                configs={configs}
                onResponseChange={handleResponseChange}
                isReadOnly={isReadOnly}
                isItLead={isItLead}
              />

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
                <span className="hidden sm:inline text-sm text-gray-500">
                  Use ← → keys to navigate
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
