"use client";

import { useState, useRef, useEffect } from "react";
import { ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sanitizeHtmlContent } from "@/lib/security/sanitize";
import { parseStepContent } from "@/lib/assessment/content-parser";
import { ParsedContentView } from "@/components/review/ParsedContentView";
import { ActiveEditors } from "@/components/collaboration/ActiveEditors";
import { StepConflictBanner } from "@/components/collaboration/StepConflictBanner";
import { CommentIndicator } from "@/components/comments/CommentIndicator";
import { CommentPanel } from "@/components/comments/CommentPanel";

interface ConfigItem {
  id: string;
  configItemName: string;
  category: string;
  selfService: boolean;
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
  fitStatus: string;
  clientNote: string | null;
  currentProcess: string | null;
  confidence?: string | null;
  evidenceUrls?: string[];
  parsedContent?: Record<string, unknown> | null;
  isClassifiable?: boolean | null;
}

interface StepReviewCardProps {
  step: StepData;
  configs: ConfigItem[];
  onResponseChange: (stepId: string, data: {
    fitStatus: string;
    clientNote?: string | undefined;
    currentProcess?: string | undefined;
    confidence?: string | undefined;
    evidenceUrls?: string[] | undefined;
  }) => void;
  isReadOnly: boolean;
  isItLead: boolean;
  assessmentId?: string;
  currentUserId?: string;
  commentCount?: number | undefined;
}

const FIT_OPTIONS = [
  {
    value: "FIT",
    label: "This matches our process",
    description: "SAP best practice aligns with how we operate",
    color: "bg-green-50 border-green-200 text-green-700",
    dotColor: "bg-green-500",
  },
  {
    value: "CONFIGURE",
    label: "We can work with this, with configuration",
    description: "SAP can handle our variation with standard settings",
    color: "bg-blue-50 border-blue-200 text-blue-700",
    dotColor: "bg-blue-500",
  },
  {
    value: "GAP",
    label: "Our process is different",
    description: "We need something SAP doesn't do out of the box",
    color: "bg-amber-50 border-amber-200 text-amber-700",
    dotColor: "bg-amber-500",
  },
  {
    value: "NA",
    label: "Not applicable to us",
    description: "This step doesn't apply to our business",
    color: "bg-gray-50 border-gray-200 text-gray-600",
    dotColor: "bg-gray-400",
  },
] as const;

const CATEGORY_STYLES: Record<string, string> = {
  Mandatory: "bg-red-100 text-red-700",
  Recommended: "bg-amber-100 text-amber-700",
  Optional: "bg-gray-100 text-gray-600",
};

const CATEGORY_TOOLTIPS: Record<string, string> = {
  Mandatory: "This configuration is required for your SAP system. It will always be included in your implementation \u2014 you cannot skip it.",
  Recommended: "SAP recommends this configuration. It is included by default, but you can exclude it if your business doesn't need it (a reason will be required).",
  Optional: "This is an advanced configuration. It is NOT included by default. Include it only if your business specifically needs this capability.",
};

const STEP_TYPE_LABELS: Record<string, string> = {
  LOGON: "Logon",
  ACCESS_APP: "Access App",
  INFORMATION: "Information",
  DATA_ENTRY: "Data Entry",
  ACTION: "Action",
  VERIFICATION: "Verification",
  NAVIGATION: "Navigation",
  PROCESS_STEP: "Process Step",
};

export function StepReviewCard({
  step,
  configs,
  onResponseChange,
  isReadOnly,
  isItLead,
  assessmentId,
  currentUserId,
  commentCount,
}: StepReviewCardProps) {
  const [commentPanelOpen, setCommentPanelOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localNote, setLocalNote] = useState<{ stepId: string; value: string }>({
    stepId: step.id,
    value: step.clientNote ?? "",
  });
  const [sapContentOverride, setSapContentOverride] = useState<{ stepId: string; fitStatus: string; expanded: boolean } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive client note — reset when step changes
  const clientNote = localNote.stepId === step.id ? localNote.value : (step.clientNote ?? "");
  const setClientNote = (value: string) => {
    setLocalNote({ stepId: step.id, value });
  };

  // Derive SAP content expanded state — collapsed after a decision is made
  const sapContentExpanded =
    sapContentOverride?.stepId === step.id && sapContentOverride?.fitStatus === step.fitStatus
      ? sapContentOverride.expanded
      : step.fitStatus === "PENDING";
  const setSapContentExpanded = (expanded: boolean) => {
    setSapContentOverride({ stepId: step.id, fitStatus: step.fitStatus, expanded });
  };

  const triggerSaveIndicator = () => {
    setSaveStatus("saving");
    if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    saveStatusTimer.current = setTimeout(() => {
      setSaveStatus("saved");
      saveStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
    }, 300);
  };

  const handleFitStatusChange = (fitStatus: string) => {
    if (isReadOnly || isItLead) return;
    onResponseChange(step.id, {
      fitStatus,
      clientNote: clientNote || undefined,
      confidence: step.confidence ?? undefined,
    });
    triggerSaveIndicator();
  };

  const handleConfidenceChange = (confidence: string) => {
    if (isReadOnly) return;
    onResponseChange(step.id, {
      fitStatus: step.fitStatus,
      clientNote: clientNote || undefined,
      confidence: confidence || undefined,
    });
    triggerSaveIndicator();
  };

  const handleNoteChange = (value: string) => {
    setClientNote(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaveStatus("saving");
    debounceRef.current = setTimeout(() => {
      onResponseChange(step.id, {
        fitStatus: step.fitStatus,
        clientNote: value || undefined,
      });
      triggerSaveIndicator();
    }, 1000);
  };

  // Cleanup debounce and save status on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);
    };
  }, []);

  const gapNoteValid = step.fitStatus !== "GAP" || clientNote.length >= 10;

  return (
    <div className="bg-card rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border flex justify-between items-start">
        <div>
          <span className="text-xs font-medium text-muted-foreground/60">
            Step {step.sequence + 1}
            {step.activityTitle ? ` · ${step.activityTitle}` : step.processFlowGroup ? ` · ${step.processFlowGroup}` : ""}
          </span>
          <h3 className="text-lg font-semibold text-foreground mt-1">{step.actionTitle}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {assessmentId && (
            <CommentIndicator
              count={commentCount ?? 0}
              onClick={() => setCommentPanelOpen(true)}
            />
          )}
          <Badge variant="outline" className="text-xs">
            {STEP_TYPE_LABELS[step.stepType] ?? step.stepType}
          </Badge>
        </div>
      </div>

      {/* Collaboration: Conflict Banner + Active Editors */}
      {assessmentId && (
        <div className="px-5 py-2 space-y-2 border-b">
          <StepConflictBanner
            assessmentId={assessmentId}
            entityType="process_step"
            entityId={step.id}
          />
          <ActiveEditors
            assessmentId={assessmentId}
            entityType="process_step"
            entityId={step.id}
            currentUserId={currentUserId}
          />
        </div>
      )}

      {/* Decision-First: Client Response Section — ABOVE SAP content */}
      <div className="px-5 py-4">
        <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
          How Does Your Company Do This?
        </span>

        {isReadOnly ? (
          <div className="mt-3">
            <p className="text-sm text-muted-foreground italic">
              {step.fitStatus === "PENDING"
                ? "No response yet"
                : `Marked as ${step.fitStatus}`}
            </p>
            {step.confidence && (
              <p className="text-xs text-muted-foreground mt-1">Confidence: {step.confidence}</p>
            )}
            {step.clientNote && (
              <p className="mt-2 text-sm text-muted-foreground bg-muted/40 p-3 rounded">
                {step.clientNote}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-col gap-3" role="radiogroup" aria-label="Fit classification">
              {FIT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  role="radio"
                  aria-checked={step.fitStatus === opt.value}
                  onClick={() => handleFitStatusChange(opt.value)}
                  disabled={isItLead}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                    step.fitStatus === opt.value
                      ? opt.color
                      : "bg-card border hover:bg-accent"
                  } ${isItLead ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                    step.fitStatus === opt.value ? "border-current" : "border-muted-foreground/60"
                  }`}>
                    {step.fitStatus === opt.value && (
                      <div className={`w-2 h-2 rounded-full ${opt.dotColor}`} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Save status indicator */}
            {saveStatus === "saved" && (
              <span className="text-xs text-green-600 flex items-center gap-1 mt-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Saved
              </span>
            )}
            {saveStatus === "saving" && (
              <span className="text-xs text-muted-foreground mt-2">Saving...</span>
            )}

            {/* Confidence dropdown — shown after a decision */}
            {step.fitStatus !== "PENDING" && (
              <div className="mt-3 flex items-center gap-3">
                <label htmlFor={`confidence-${step.id}`} className="text-xs font-medium text-muted-foreground" title="How confident are you in this classification? High = certain, Medium = likely, Low = best guess">Confidence:</label>
                <Select value={step.confidence ?? ""} onValueChange={handleConfidenceChange}>
                  <SelectTrigger id={`confidence-${step.id}`} className="w-36 h-8 text-xs"><SelectValue placeholder="Confidence level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Gap Detail */}
            {step.fitStatus === "GAP" && (
              <div className="mt-4 p-4 bg-amber-50 rounded-md border border-amber-200">
                <label className="text-xs font-medium text-amber-600 uppercase tracking-wider">
                  Tell Us How Your Process Differs
                </label>
                <Textarea
                  value={clientNote}
                  onChange={(e) => handleNoteChange(e.target.value)}
                  placeholder="Describe your current process and what you need that differs from SAP's approach..."
                  className="mt-2 min-h-[96px]"
                  required
                />
                <p className={`text-xs mt-1 ${gapNoteValid ? "text-muted-foreground/60" : "text-red-500"}`}>
                  {clientNote.length} / 10 minimum characters
                </p>
              </div>
            )}

            {/* Configure Detail */}
            {step.fitStatus === "CONFIGURE" && (
              <div className="mt-4 p-4 bg-blue-50 rounded-md border border-blue-200">
                <label className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                  What Configuration Do You Need?
                </label>
                <Textarea
                  value={clientNote}
                  onChange={(e) => handleNoteChange(e.target.value)}
                  placeholder="Describe the specific configuration needed (e.g., different payment terms, approval thresholds)..."
                  className="mt-2 min-h-[72px]"
                />
              </div>
            )}

            {/* IT Lead notes-only mode */}
            {isItLead && (
              <div className="mt-4 p-4 bg-muted/40 rounded-md border">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Technical Notes (IT Lead)
                </label>
                <Textarea
                  value={clientNote}
                  onChange={(e) => handleNoteChange(e.target.value)}
                  placeholder="Add technical notes about this step..."
                  className="mt-2 min-h-[72px]"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Collapsible SAP Content Section */}
      <div className="border-t">
        <button
          onClick={() => setSapContentExpanded(!sapContentExpanded)}
          className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-muted/40 transition-colors"
        >
          {sapContentExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
            What SAP Best Practice Says
          </span>
        </button>
        {sapContentExpanded && (
          <div className="px-5 pb-4 bg-muted/40 overflow-x-auto max-w-full">
            <div className="prose prose-sm max-w-none [&_table]:max-w-full [&_table]:table-auto [&_table]:overflow-x-auto [&_img]:max-w-full">
              <ParsedContentView
                content={step.parsedContent
                  ? step.parsedContent as unknown as import("@/lib/assessment/content-parser").ParsedStepContent
                  : parseStepContent(step.actionInstructionsHtml)}
                fallbackHtml={step.actionInstructionsHtml}
              />
            </div>
            {step.actionExpectedResult && (
              <div className="mt-3">
                <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Expected Result
                </span>
                <div className="overflow-x-auto max-w-full">
                  <div
                    className="prose prose-sm max-w-none text-muted-foreground italic mt-1 [&_table]:max-w-full [&_table]:table-auto [&_img]:max-w-full"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(step.actionExpectedResult) }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Related Configs */}
      {configs.length > 0 && (
        <div className="px-5 py-3 bg-blue-50/30 border-t border-blue-100">
          <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">
            Related Configuration Activities
          </span>
          <div className="mt-2 flex flex-col gap-2">
            {configs.map((config) => (
              <div key={config.id} className="flex items-center gap-2">
                <Badge
                  className={`text-xs cursor-help ${CATEGORY_STYLES[config.category] ?? "bg-gray-100 text-gray-600"}`}
                  title={CATEGORY_TOOLTIPS[config.category] ?? ""}
                >
                  {config.category}
                </Badge>
                <span className="text-sm">{config.configItemName}</span>
                {config.selfService && (
                  <Badge
                    variant="outline"
                    className="text-xs text-green-600 border-green-300 cursor-help"
                    title="Self-Service: Your team can configure this directly in SAP without raising a support ticket."
                  >
                    Self-Service
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Context */}
      {step.activityTitle && (
        <div className="px-5 py-3 bg-muted/40 border-t border flex items-center gap-3">
          <div>
            <span className="text-xs text-muted-foreground/60">Activity</span>
            <p className="text-sm text-muted-foreground">{step.activityTitle}</p>
          </div>
          {step.activityTargetUrl && (
            <a
              href={step.activityTargetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" />
              Open in SAP
            </a>
          )}
        </div>
      )}

      {/* Comment Panel */}
      {assessmentId && currentUserId && (
        <CommentPanel
          open={commentPanelOpen}
          onOpenChange={setCommentPanelOpen}
          assessmentId={assessmentId}
          targetType="STEP"
          targetId={step.id}
          targetLabel={step.actionTitle}
          currentUserId={currentUserId}
        />
      )}
    </div>
  );
}
