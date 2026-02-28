/**
 * @deprecated Use ReviewShell instead. This component uses flat step loading
 * and string-based grouping. Retained for rollback safety; remove after 3 months
 * of stable production with ReviewShell (target: May 2026).
 */
"use client";

import { useState, useCallback, useEffect, useMemo, useRef, memo } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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

// Memoized scope item button for sidebar
const ScopeItemButton = memo(function ScopeItemButton({
  item,
  isActive,
  onClick,
}: {
  item: ScopeItemNav;
  isActive: boolean;
  onClick: (id: string) => void;
}) {
  const percent = item.totalSteps > 0
    ? Math.round((item.reviewedSteps / item.totalSteps) * 100)
    : 0;

  return (
    <button
      onClick={() => onClick(item.id)}
      className={`w-full text-left px-4 py-2 transition-colors ${
        isActive
          ? "bg-card border-l-2 border-blue-500"
          : "hover:bg-accent border-l-2 border-transparent"
      }`}
    >
      <p className="text-xs font-medium text-foreground truncate" title={item.nameClean}>{item.nameClean}</p>
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
});

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json() as Promise<T>;
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
  const [localStepOverrides, setLocalStepOverrides] = useState<
    Map<string, Partial<StepData>>
  >(new Map());
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [overallProgress, setOverallProgress] = useState(initialProgress);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkAllLoading, setBulkAllLoading] = useState(false);

  const isReadOnly = assessmentStatus === "signed_off" || assessmentStatus === "reviewed";
  const isItLead = userRole === "it_lead";

  // React Query: fetch catalog steps (static, 5 min stale)
  const { data: stepsData, isLoading: stepsLoading } = useQuery({
    queryKey: ["catalog-steps", currentScopeItemId],
    queryFn: () =>
      fetchJson<{ data: StepData[] }>(
        `/api/catalog/scope-items/${currentScopeItemId}/steps?limit=200`,
      ),
    enabled: !!currentScopeItemId,
    staleTime: 5 * 60 * 1000,
  });

  // React Query: fetch catalog configs (REM-03: pass assessmentId for country filtering)
  const { data: configsData, isLoading: configsLoading } = useQuery({
    queryKey: ["catalog-configs", currentScopeItemId, assessmentId],
    queryFn: () =>
      fetchJson<{ data: ConfigItem[] }>(
        `/api/catalog/scope-items/${currentScopeItemId}/configs?assessmentId=${assessmentId}`,
      ),
    enabled: !!currentScopeItemId,
    staleTime: 5 * 60 * 1000,
  });

  // React Query: fetch step responses (mutable, 1 min stale)
  const { data: responsesData, isLoading: responsesLoading } = useQuery({
    queryKey: ["step-responses", assessmentId, currentScopeItemId],
    queryFn: () =>
      fetchJson<{ data: Array<{ processStepId: string; fitStatus: string; clientNote: string | null; currentProcess: string | null; confidence?: string | null }> }>(
        `/api/assessments/${assessmentId}/steps?scopeItemId=${currentScopeItemId}&limit=200`,
      ),
    enabled: !!currentScopeItemId,
    staleTime: 60 * 1000,
  });

  const loading = stepsLoading || configsLoading || responsesLoading;

  // Merge catalog steps + responses + local overrides
  const steps = useMemo(() => {
    if (!stepsData?.data) return [];
    const responseMap = new Map<string, { fitStatus: string; clientNote: string | null; currentProcess: string | null; confidence?: string | null }>();
    for (const r of responsesData?.data ?? []) {
      responseMap.set(r.processStepId, {
        fitStatus: r.fitStatus,
        clientNote: r.clientNote,
        currentProcess: r.currentProcess,
        confidence: r.confidence ?? null,
      });
    }
    return stepsData.data.map((step) => {
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
  }, [stepsData, responsesData, localStepOverrides]);

  const configs = useMemo(() => configsData?.data ?? [], [configsData]);

  // Reset step index and local overrides when scope item changes
  useEffect(() => {
    setCurrentStepIndex(0);
    setLocalStepOverrides(new Map());
  }, [currentScopeItemId]);

  // Ref to current steps for use in callbacks without re-creating them
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  // Group steps using the step grouper
  const stepGroups = useMemo(() => groupSteps(steps), [steps]);
  const classifiableProgress = useMemo(() => computeClassifiableProgress(stepGroups), [stepGroups]);

  // Visible steps: either all or classifiable only
  const visibleSteps = useMemo(() => {
    if (showAllSteps) return steps;
    return steps.filter((s) => {
      if (s.isClassifiable === true) return true;
      if (s.isClassifiable === false) return false;
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

  // Auto-advance to next unclassified step after classification
  const advanceToNextUnclassified = useCallback(() => {
    const nextIdx = visibleSteps.findIndex(
      (s, i) => i > currentStepIndex && s.fitStatus === "PENDING",
    );
    if (nextIdx >= 0) {
      setCurrentStepIndex(nextIdx);
    } else if (currentStepIndex < visibleSteps.length - 1) {
      setCurrentStepIndex((i) => i + 1);
    }
  }, [visibleSteps, currentStepIndex]);

  // Handle step click from sidebar
  const handleStepClick = useCallback(
    (stepId: string) => {
      const idx = visibleSteps.findIndex((s) => s.id === stepId);
      if (idx >= 0) {
        setCurrentStepIndex(idx);
      } else if (!showAllSteps) {
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

  // Stable scope item click handler
  const handleScopeItemClick = useCallback((id: string) => setCurrentScopeItemId(id), []);

  // Handle response change — uses stepsRef to avoid recreating on every steps change
  const handleResponseChange = useCallback(
    async (stepId: string, data: { fitStatus: string; clientNote?: string | undefined; currentProcess?: string | undefined; confidence?: string | undefined }) => {
      // Optimistic update via local overrides
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

      // Update sidebar counts optimistically
      if (currentScopeItemId) {
        setScopeItems((prev) =>
          prev.map((item) => {
            if (item.id !== currentScopeItemId) return item;
            const oldStep = stepsRef.current.find((s) => s.id === stepId);
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
          const oldStep = stepsRef.current.find((s) => s.id === stepId);
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

      // Auto-advance to next unclassified step when a status is assigned
      const oldStep = stepsRef.current.find((s) => s.id === stepId);
      if (oldStep?.fitStatus === "PENDING" && data.fitStatus !== "PENDING") {
        setTimeout(advanceToNextUnclassified, 200);
      }
    },
    [assessmentId, currentScopeItemId, advanceToNextUnclassified],
  );

  // Keyboard navigation + shortcuts (F=Fit, C=Configure, G=Gap, N=N/A)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowLeft" && currentStepIndex > 0) {
        setCurrentStepIndex((i) => i - 1);
      } else if (e.key === "ArrowRight" && currentStepIndex < visibleSteps.length - 1) {
        setCurrentStepIndex((i) => i + 1);
      }

      // Classification shortcuts — only when not read-only and step is classifiable
      if (isReadOnly || !currentStep || !currentStepIsClassifiable) return;
      const keyMap: Record<string, string> = { f: "FIT", c: "CONFIGURE", g: "GAP", n: "NA" };
      const status = keyMap[e.key.toLowerCase()];
      if (status) {
        e.preventDefault();
        void handleResponseChange(currentStep.id, { fitStatus: status });
        // Auto-advance after a brief delay for visual feedback
        setTimeout(advanceToNextUnclassified, 150);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStepIndex, visibleSteps.length, currentStep, currentStepIsClassifiable, isReadOnly, handleResponseChange, advanceToNextUnclassified]);

  // Bulk mark remaining as FIT
  const handleBulkFit = useCallback(async () => {
    if (!currentScopeItemId || bulkLoading) return;

    const pendingSteps = stepsRef.current.filter((s) => s.fitStatus === "PENDING");
    if (pendingSteps.length === 0) return;

    const confirmed = window.confirm(
      `Mark ${pendingSteps.length} remaining ${pendingSteps.length === 1 ? "step" : "steps"} as FIT? This will classify all unreviewed steps in this scope item.`,
    );
    if (!confirmed) return;

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
        setLocalStepOverrides((prev) => {
          const next = new Map(prev);
          for (const step of stepsRef.current) {
            if (step.fitStatus === "PENDING") {
              next.set(step.id, { ...step, fitStatus: "FIT" });
            }
          }
          return next;
        });

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
  }, [assessmentId, currentScopeItemId, bulkLoading]);

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

  return (
    <div className="flex">
      {/* Sidebar — scope item picker + step group navigation */}
      <div className="hidden sm:flex sm:w-[300px] shrink-0 bg-muted/40 border-r border flex-col h-screen sticky top-0 overflow-hidden">
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
          {scopeItems.map((item) => (
            <ScopeItemButton
              key={item.id}
              item={item}
              isActive={currentScopeItemId === item.id}
              onClick={handleScopeItemClick}
            />
          ))}
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
              {showAllSteps ? "Showing all steps (incl. system)" : "Showing only steps that need your input"}
            </button>
          </div>
          <div className="space-y-1">
            <StatRow label="FIT" count={overallProgress.fit} color="bg-green-500" />
            <StatRow label="CONFIGURE" count={overallProgress.configure} color="bg-blue-500" />
            <StatRow label="GAP" count={overallProgress.gap} color="bg-amber-500" />
            <StatRow label="N/A" count={overallProgress.na} color="bg-slate-300" />
            <StatRow label="PENDING" count={overallProgress.pending} color="bg-slate-200" />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 p-8">
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
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleAcceptAllStandard}
                        disabled={bulkAllLoading || overallProgress.pending === 0}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        {bulkAllLoading ? "Marking..." : "\u2713 Accept All SAP Standard"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBulkFit}
                        disabled={bulkLoading || steps.filter((s) => s.fitStatus === "PENDING").length === 0}
                      >
                        {bulkLoading ? "Marking..." : "Mark remaining as FIT"}
                      </Button>
                    </>
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

              {/* Step counter + mini navigation */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm font-medium text-foreground">
                  Step {currentStepIndex + 1} of {visibleSteps.length}
                </span>
                {currentStep && (
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                    currentStep.fitStatus === "FIT" ? "bg-green-100 text-green-700"
                    : currentStep.fitStatus === "CONFIGURE" ? "bg-blue-100 text-blue-700"
                    : currentStep.fitStatus === "GAP" ? "bg-amber-100 text-amber-700"
                    : currentStep.fitStatus === "NA" ? "bg-slate-50 text-slate-500"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    {currentStep.fitStatus === "PENDING" ? "Unreviewed" : currentStep.fitStatus}
                  </span>
                )}
              </div>

              {/* Breadcrumb trail */}
              <div className="text-xs text-muted-foreground mb-3">
                <span className="font-medium">{scopeItems.find((i) => i.id === currentScopeItemId)?.nameClean}</span>
                {activeGroupKey && (
                  <>
                    <span className="mx-1.5">→</span>
                    <span>{activeGroupKey}</span>
                  </>
                )}
                {currentStep.actionTitle && (
                  <>
                    <span className="mx-1.5">→</span>
                    <span>{currentStep.actionTitle}</span>
                  </>
                )}
                <span className="mx-2">·</span>
                <span>Step {currentStepIndex + 1} of {visibleSteps.length}</span>
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
                <span className="hidden sm:inline text-xs text-muted-foreground">
                  Keyboard: ← → to navigate, F C G N to classify
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
