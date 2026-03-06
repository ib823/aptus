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
import { getBusinessContextHint } from "@/lib/assessment/business-context";
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
  stepCategory?: string | null;
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

const CATEGORY_STYLES: Record<string, string> = {
  Mandatory: "bg-red-50 text-red-700 border border-red-200",
  Recommended: "bg-amber-50 text-amber-700 border border-amber-200",
  Optional: "bg-slate-50 text-slate-500 border border-slate-200",
};

const CATEGORY_TOOLTIPS: Record<string, string> = {
  Mandatory: "Required: This setting must be configured for your SAP system to work correctly. Your implementation consultant will handle this during the project \u2014 no action needed from you right now.",
  Recommended: "Recommended: SAP recommends this setting. It will be configured by your consultant unless you specifically ask to exclude it. You can review and exclude it later in the Configuration Matrix if your business doesn't need it.",
  Optional: "Optional: This is an advanced setting, NOT included by default. If your business needs this capability, flag it for your consultant. Otherwise, ignore it.",
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
  const [helpRequestMode, setHelpRequestMode] = useState(false);
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
      {/* Decision-First: Compact classification grid at top */}
      <div className="px-5 py-3 border-b">
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Fit classification">
          {([
            { value: "FIT", icon: "✓", label: "Matches", title: "This step matches how we currently work", selected: "bg-green-50 border-green-500 text-green-700" },
            { value: "CONFIGURE", icon: "⚙", label: "Needs Adjustment", title: "SAP can handle this with some configuration changes", selected: "bg-blue-50 border-blue-500 text-blue-700" },
            { value: "GAP", icon: "⚠", label: "Doesn\u2019t Match", title: "This doesn\u2019t match our process \u2014 needs a custom solution", selected: "bg-amber-50 border-amber-500 text-amber-700" },
            { value: "NA", icon: "—", label: "Not Relevant", title: "This step doesn\u2019t apply to our business", selected: "bg-slate-50 border-slate-300 text-slate-500" },
          ] as const).map((opt) => {
            const isSelected = step.fitStatus === opt.value;
            return (
              <button
                key={opt.value}
                role="radio"
                aria-checked={isSelected}
                title={opt.title}
                onClick={() => handleFitStatusChange(opt.value)}
                disabled={isReadOnly || isItLead}
                className={`py-2 px-1 rounded-md border text-center text-sm font-medium transition-all ${
                  isSelected ? opt.selected : "border-slate-200 text-muted-foreground bg-card hover:bg-accent"
                } ${(isReadOnly || isItLead) ? "cursor-not-allowed opacity-70" : ""}`}
              >
                {opt.icon} {opt.label}
              </button>
            );
          })}
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
      </div>

      {/* Step header */}
      <div className="px-5 py-4 border-b border flex justify-between items-start">
        <div>
          <span className="text-xs font-medium text-muted-foreground/60">
            Step {step.sequence + 1}
            {step.activityTitle ? ` · ${step.activityTitle}` : step.processFlowGroup ? ` · ${step.processFlowGroup}` : ""}
          </span>
          <h3 className="text-lg font-semibold text-foreground mt-1">{step.actionTitle}</h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {assessmentId && currentUserId && !isReadOnly && (
            <button
              onClick={() => {
                setHelpRequestMode(true);
                setCommentPanelOpen(true);
              }}
              className="text-xs flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Ask Consultant
            </button>
          )}
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

      {/* What this step does — business explanation */}
      <div className="px-5 py-3 border-b">
        <span className="text-xs font-semibold text-foreground">What this step does:</span>
        {(() => {
          const hint = getBusinessContextHint(step.actionTitle, step.stepCategory);
          const parsed = step.parsedContent
            ? (step.parsedContent as unknown as import("@/lib/assessment/content-parser").ParsedStepContent)
            : parseStepContent(step.actionInstructionsHtml);
          const purpose = parsed?.purpose;
          if (hint) {
            return (
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {hint}
              </p>
            );
          }
          if (purpose) {
            return (
              <div
                className="text-sm text-muted-foreground mt-1 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(purpose) }}
              />
            );
          }
          return (
            <p className="text-sm text-muted-foreground mt-1 italic">
              Review the technical details below to assess this step.
            </p>
          );
        })()}
      </div>

      {/* Response details: confidence, notes */}
      <div className="px-5 py-4">
        {isReadOnly ? (
          <div>
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
            {/* Confidence — REM-27: user-friendly labels + explanation */}
            {step.fitStatus !== "PENDING" && (
              <div className="p-3 bg-muted/30 rounded-md">
                <div className="flex items-center gap-3">
                  <label htmlFor={`confidence-${step.id}`} className="text-xs font-medium text-muted-foreground">
                    How sure are you?
                  </label>
                  <Select value={step.confidence ?? ""} onValueChange={handleConfidenceChange}>
                    <SelectTrigger id={`confidence-${step.id}`} className="w-44 h-8 text-xs">
                      <SelectValue placeholder="Select confidence" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High &mdash; I&apos;m certain</SelectItem>
                      <SelectItem value="medium">Medium &mdash; I think so</SelectItem>
                      <SelectItem value="low">Low &mdash; best guess</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                  Low-confidence answers will be flagged for consultant review during the workshop. It&apos;s OK to guess &mdash; that&apos;s what this field is for.
                </p>
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

      {/* Technical Details — collapsed by default — REM-28 */}
      <div className="border-t">
        <button
          onClick={() => setSapContentExpanded(!sapContentExpanded)}
          className="w-full px-5 py-2 flex items-center gap-2 hover:bg-muted/30 transition-colors text-left"
        >
          {sapContentExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-primary">
            Technical Details for Implementation Team
          </span>
        </button>
        {sapContentExpanded && (
          <div className="px-5 pb-4 overflow-x-auto max-w-full">
            <div className="bg-muted/50 rounded-md p-3 prose prose-sm max-w-none font-mono text-xs text-muted-foreground [&_table]:max-w-full [&_table]:table-auto [&_table]:overflow-x-auto [&_img]:max-w-full">
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
                  Expected Result (Test Verification)
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
                  className={`text-xs cursor-help ${CATEGORY_STYLES[config.category] ?? "bg-slate-50 text-slate-600"}`}
                  title={CATEGORY_TOOLTIPS[config.category] ?? ""}
                >
                  {config.category}
                </Badge>
                <span className="text-sm">{config.configItemName}</span>
                {config.selfService && (
                  <Badge
                    variant="outline"
                    className="text-xs text-green-600 border-green-300 cursor-help"
                    title="Self-Service: Your team can change this setting directly in SAP after go-live without raising a support ticket. Your consultant will still configure it initially."
                  >
                    Self-Service
                  </Badge>
                )}
              </div>
            ))}
          </div>
          {/* Action guidance — REM-29 */}
          <p className="text-[10px] text-muted-foreground/50 mt-2 italic">
            These settings will be configured by your consultant during implementation. Hover over each badge for details.
          </p>
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
          onOpenChange={(open) => {
            setCommentPanelOpen(open);
            if (!open) setHelpRequestMode(false);
          }}
          assessmentId={assessmentId}
          targetType="STEP"
          targetId={step.id}
          targetLabel={step.actionTitle}
          currentUserId={currentUserId}
          initialHelpRequest={helpRequestMode}
        />
      )}
    </div>
  );
}
