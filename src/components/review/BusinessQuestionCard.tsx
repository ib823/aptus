"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ImplicationsPanel } from "@/components/review/ImplicationsPanel";
import { getBusinessContextHint } from "@/lib/assessment/business-context";
import type { ActivityNode } from "@/types/hierarchy";
import type {
  ActivityMetadata,
  ClassificationImplication,
  ScopeItemMetadata,
} from "@/constants/scope-item-metadata";

// --- Types ---

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

interface BusinessQuestionCardProps {
  activity: ActivityNode;
  steps: StepData[];
  configs: ConfigItem[];
  scopeItemId: string;
  assessmentId: string;
  currentUserId: string;
  activityMetadata: ActivityMetadata | null;
  scopeItemMetadata: ScopeItemMetadata | null;
  implications: ClassificationImplication | null;
  onActivityClassify: (activityId: string, fitStatus: string, note?: string) => void;
  isReadOnly: boolean;
}

// --- Non-classifiable step types ---

const NON_CLASSIFIABLE_TYPES = ["LOGON", "LOGOFF", "ACCESS_APP", "INFORMATION", "NAVIGATION"];

const STATUS_DISPLAY_LABELS: Record<string, string> = {
  FIT: "Matches",
  CONFIGURE: "Needs Adjustment",
  GAP: "Doesn\u2019t Match",
  NA: "Not Relevant",
  PENDING: "Unreviewed",
  MIXED: "Mixed",
};

// --- Classification button config ---

const CLASSIFICATION_OPTIONS = [
  { value: "FIT", icon: "\u2713", label: "Matches", title: "This matches how we currently work", selected: "bg-green-50 border-green-500 text-green-700" },
  { value: "CONFIGURE", icon: "\u2699", label: "Needs Adjustment", title: "SAP can handle this with some configuration changes", selected: "bg-blue-50 border-blue-500 text-blue-700" },
  { value: "GAP", icon: "\u26A0", label: "Doesn\u2019t Match", title: "This doesn\u2019t match our process \u2014 needs a custom solution", selected: "bg-amber-50 border-amber-500 text-amber-700" },
  { value: "NA", icon: "\u2014", label: "Not Relevant", title: "This doesn\u2019t apply to our business", selected: "bg-slate-50 border-slate-300 text-slate-500" },
] as const;

// --- Component ---

export function BusinessQuestionCard({
  activity,
  steps,
  configs,
  scopeItemId,
  activityMetadata,
  scopeItemMetadata,
  implications,
  onActivityClassify,
  isReadOnly,
}: BusinessQuestionCardProps) {
  const [showSteps, setShowSteps] = useState(false);
  const [showImplications, setShowImplications] = useState(false);
  const [localNote, setLocalNote] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Compute classifiable step statistics
  const classifiableSteps = useMemo(
    () =>
      steps.filter(
        (s) =>
          s.isClassifiable !== false &&
          !NON_CLASSIFIABLE_TYPES.includes(s.stepType),
      ),
    [steps],
  );

  const totalSteps = steps.length;
  const classifiableCount = classifiableSteps.length;
  const classifiedCount = classifiableSteps.filter(
    (s) => s.fitStatus !== "PENDING",
  ).length;

  // Compute aggregate status
  const aggregateStatus = useMemo(() => {
    const classified = classifiableSteps.filter((s) => s.fitStatus !== "PENDING");
    if (classified.length === 0) return "PENDING";
    const statuses = new Set(classified.map((s) => s.fitStatus));
    if (statuses.size === 1) return classified[0]?.fitStatus ?? "PENDING";
    return "MIXED";
  }, [classifiableSteps]);

  // Count steps with each classification
  const statusCounts = useMemo(() => {
    const counts = { FIT: 0, CONFIGURE: 0, GAP: 0, NA: 0, PENDING: 0 };
    for (const s of classifiableSteps) {
      const key = s.fitStatus as keyof typeof counts;
      if (key in counts) counts[key]++;
    }
    return counts;
  }, [classifiableSteps]);

  // Steps that have a classification different from the aggregate
  const conflictingStepCount = useMemo(() => {
    if (aggregateStatus === "PENDING" || aggregateStatus === "MIXED") return 0;
    return classifiableSteps.filter(
      (s) => s.fitStatus !== "PENDING" && s.fitStatus !== aggregateStatus,
    ).length;
  }, [classifiableSteps, aggregateStatus]);

  // Business question text
  const questionText = activityMetadata?.businessQuestion
    ?? getBusinessContextHint(activity.title, "BUSINESS_PROCESS")
    ?? "Does your company have a process similar to what SAP describes here?";

  const thinkAboutText = activityMetadata?.thinkAbout ?? null;

  // Save indicator
  const triggerSave = useCallback(() => {
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaveStatus("saved");
      saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    }, 300);
  }, []);

  // Handle classification
  const handleClassify = useCallback(
    (fitStatus: string) => {
      if (isReadOnly) return;

      // If some steps already have different classifications, confirm override
      const alreadyClassifiedDifferently = classifiableSteps.filter(
        (s) => s.fitStatus !== "PENDING" && s.fitStatus !== fitStatus,
      );

      if (alreadyClassifiedDifferently.length > 0) {
        const confirmed = window.confirm(
          `${alreadyClassifiedDifferently.length} step(s) already have different classifications. Override them with "${fitStatus}"?`,
        );
        if (!confirmed) return;
      }

      onActivityClassify(activity.id, fitStatus, localNote || undefined);
      triggerSave();
      setShowImplications(true);
    },
    [activity.id, classifiableSteps, isReadOnly, localNote, onActivityClassify, triggerSave],
  );

  // Debounced note save
  const handleNoteChange = useCallback(
    (value: string) => {
      setLocalNote(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (aggregateStatus !== "PENDING" && aggregateStatus !== "MIXED") {
        setSaveStatus("saving");
        debounceRef.current = setTimeout(() => {
          onActivityClassify(activity.id, aggregateStatus, value || undefined);
          triggerSave();
        }, 1000);
      }
    },
    [activity.id, aggregateStatus, onActivityClassify, triggerSave],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const displayTitle = activity.title === "__main_activity__" ? "Process Steps" : activity.title;
  const gapNoteValid = aggregateStatus !== "GAP" || localNote.length >= 10;

  return (
    <div className="bg-card rounded-lg border overflow-hidden" id={`activity-${activity.id}`}>
      {/* Header */}
      <div className="px-5 py-3 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">{displayTitle}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalSteps} step{totalSteps !== 1 ? "s" : ""} &middot;{" "}
              {classifiableCount} require{classifiableCount !== 1 ? "" : "s"} classification
              {classifiedCount > 0 && (
                <span className="ml-1">
                  &middot; {classifiedCount} already classified
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Aggregate status indicator */}
            {aggregateStatus !== "PENDING" && (
              <Badge
                className={`text-xs ${
                  aggregateStatus === "FIT" ? "bg-green-50 text-green-700 border-green-200"
                  : aggregateStatus === "CONFIGURE" ? "bg-blue-50 text-blue-700 border-blue-200"
                  : aggregateStatus === "GAP" ? "bg-amber-50 text-amber-700 border-amber-200"
                  : aggregateStatus === "NA" ? "bg-slate-50 text-slate-500 border-slate-200"
                  : "bg-purple-50 text-purple-700 border-purple-200"
                }`}
              >
                {STATUS_DISPLAY_LABELS[aggregateStatus] ?? aggregateStatus}
              </Badge>
            )}
            {/* Save indicator */}
            {saveStatus === "saved" && (
              <span className="text-xs text-green-600">Saved</span>
            )}
            {saveStatus === "saving" && (
              <span className="text-xs text-muted-foreground">Saving...</span>
            )}
          </div>
        </div>

        {/* Mini progress bar */}
        {classifiableCount > 0 && (
          <div className="h-1.5 rounded-full bg-slate-100 mt-2 flex overflow-hidden">
            {statusCounts.FIT > 0 && (
              <div
                className="h-full bg-green-500"
                style={{ width: `${(statusCounts.FIT / classifiableCount) * 100}%` }}
              />
            )}
            {statusCounts.CONFIGURE > 0 && (
              <div
                className="h-full bg-blue-500"
                style={{ width: `${(statusCounts.CONFIGURE / classifiableCount) * 100}%` }}
              />
            )}
            {statusCounts.GAP > 0 && (
              <div
                className="h-full bg-amber-500"
                style={{ width: `${(statusCounts.GAP / classifiableCount) * 100}%` }}
              />
            )}
            {statusCounts.NA > 0 && (
              <div
                className="h-full bg-slate-400"
                style={{ width: `${(statusCounts.NA / classifiableCount) * 100}%` }}
              />
            )}
          </div>
        )}
      </div>

      {/* Business question */}
      <div className="px-5 py-4 border-b">
        <p className="text-sm font-medium text-foreground">{questionText}</p>
        {thinkAboutText && (
          <div className="mt-2 p-3 bg-blue-50/50 rounded-md border border-blue-100">
            <p className="text-xs text-blue-700 leading-relaxed">{thinkAboutText}</p>
          </div>
        )}
      </div>

      {/* Classification buttons */}
      <div className="px-5 py-3 border-b">
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Activity classification">
          {CLASSIFICATION_OPTIONS.map((opt) => {
            const isSelected = aggregateStatus === opt.value;
            return (
              <button
                key={opt.value}
                role="radio"
                aria-checked={isSelected}
                title={opt.title}
                onClick={() => handleClassify(opt.value)}
                disabled={isReadOnly}
                className={`py-2 px-1 rounded-md border text-center text-sm font-medium transition-all ${
                  isSelected ? opt.selected : "border-slate-200 text-muted-foreground bg-card hover:bg-accent"
                } ${isReadOnly ? "cursor-not-allowed opacity-70" : ""}`}
              >
                {opt.icon} {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conflict warning */}
      {conflictingStepCount > 0 && (
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-200">
          <p className="text-xs text-amber-700">
            {conflictingStepCount} step{conflictingStepCount !== 1 ? "s have" : " has"} different classification{conflictingStepCount !== 1 ? "s" : ""}. Switch to Detailed Steps to review individually.
          </p>
        </div>
      )}

      {/* Notes section */}
      {!isReadOnly && aggregateStatus !== "PENDING" && aggregateStatus !== "MIXED" && (
        <div className="px-5 py-3">
          {aggregateStatus === "GAP" && (
            <div className="p-3 bg-amber-50 rounded-md border border-amber-200">
              <label className="text-xs font-medium text-amber-600 uppercase tracking-wider">
                Tell Us How Your Process Differs
              </label>
              <Textarea
                value={localNote}
                onChange={(e) => handleNoteChange(e.target.value)}
                placeholder="Describe your current process and what you need that differs from SAP's approach..."
                className="mt-2 min-h-[80px]"
              />
              <p className={`text-xs mt-1 ${gapNoteValid ? "text-muted-foreground/60" : "text-red-500"}`}>
                {localNote.length} / 10 minimum characters
              </p>
            </div>
          )}
          {aggregateStatus === "CONFIGURE" && (
            <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
              <label className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                What Configuration Do You Need?
              </label>
              <Textarea
                value={localNote}
                onChange={(e) => handleNoteChange(e.target.value)}
                placeholder="Describe the specific configuration needed..."
                className="mt-2 min-h-[60px]"
              />
            </div>
          )}
        </div>
      )}

      {/* Implications panel */}
      {aggregateStatus !== "PENDING" && aggregateStatus !== "MIXED" && (
        <div className="px-5 pb-3">
          <ImplicationsPanel
            fitStatus={aggregateStatus}
            scopeItemId={scopeItemId}
            activityTitle={activity.title}
            activityMetadata={activityMetadata}
            scopeItemMetadata={scopeItemMetadata}
            implications={implications}
            configs={configs}
            isExpanded={showImplications}
            onToggle={() => setShowImplications(!showImplications)}
          />
        </div>
      )}

      {/* Child step summary (collapsible) */}
      <div className="border-t">
        <button
          onClick={() => setShowSteps(!showSteps)}
          className="w-full px-5 py-2 flex items-center gap-2 hover:bg-muted/30 transition-colors text-left"
        >
          {showSteps ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-sm text-primary font-medium">
            View {totalSteps} individual step{totalSteps !== 1 ? "s" : ""}
          </span>
        </button>

        {showSteps && (
          <div className="px-5 pb-3 space-y-1">
            {steps.map((step) => {
              const isClassifiable =
                step.isClassifiable !== false &&
                !NON_CLASSIFIABLE_TYPES.includes(step.stepType);

              return (
                <div
                  key={step.id}
                  className="flex items-center gap-2 py-1 text-xs"
                >
                  {/* Status indicator */}
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      !isClassifiable ? "bg-slate-200"
                      : step.fitStatus === "FIT" ? "bg-green-500"
                      : step.fitStatus === "CONFIGURE" ? "bg-blue-500"
                      : step.fitStatus === "GAP" ? "bg-amber-500"
                      : step.fitStatus === "NA" ? "bg-slate-400"
                      : "bg-slate-200"
                    }`}
                  />

                  {/* Title */}
                  <span
                    className={`truncate flex-1 ${!isClassifiable ? "text-muted-foreground/60" : "text-foreground"}`}
                    title={step.actionTitle}
                  >
                    {step.actionTitle}
                  </span>

                  {/* Type badge */}
                  {!isClassifiable && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground/50 shrink-0">
                      {step.stepType}
                    </Badge>
                  )}

                  {/* Classification badge (if differs from aggregate) */}
                  {isClassifiable &&
                    step.fitStatus !== "PENDING" &&
                    step.fitStatus !== aggregateStatus && (
                      <Badge
                        className={`text-[10px] shrink-0 ${
                          step.fitStatus === "FIT" ? "bg-green-50 text-green-700"
                          : step.fitStatus === "CONFIGURE" ? "bg-blue-50 text-blue-700"
                          : step.fitStatus === "GAP" ? "bg-amber-50 text-amber-700"
                          : "bg-slate-50 text-slate-500"
                        }`}
                      >
                        {STATUS_DISPLAY_LABELS[step.fitStatus] ?? step.fitStatus}
                      </Badge>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
