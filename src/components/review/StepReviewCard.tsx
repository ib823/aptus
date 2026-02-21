"use client";

import { useState, useRef, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { sanitizeHtmlContent } from "@/lib/security/sanitize";

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
}

interface StepReviewCardProps {
  step: StepData;
  configs: ConfigItem[];
  onResponseChange: (stepId: string, data: {
    fitStatus: string;
    clientNote?: string | undefined;
    currentProcess?: string | undefined;
  }) => void;
  isReadOnly: boolean;
  isItLead: boolean;
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
}: StepReviewCardProps) {
  const [localNote, setLocalNote] = useState<{ stepId: string; value: string }>({
    stepId: step.id,
    value: step.clientNote ?? "",
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive client note — reset when step changes
  const clientNote = localNote.stepId === step.id ? localNote.value : (step.clientNote ?? "");
  const setClientNote = (value: string) => {
    setLocalNote({ stepId: step.id, value });
  };

  const handleFitStatusChange = (fitStatus: string) => {
    if (isReadOnly || isItLead) return;
    onResponseChange(step.id, {
      fitStatus,
      clientNote: clientNote || undefined,
    });
  };

  const handleNoteChange = (value: string) => {
    setClientNote(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onResponseChange(step.id, {
        fitStatus: step.fitStatus,
        clientNote: value || undefined,
      });
    }, 1000);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const gapNoteValid = step.fitStatus !== "GAP" || clientNote.length >= 10;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-start">
        <div>
          <span className="text-xs font-medium text-gray-400">
            Step {step.sequence + 1}
            {step.processFlowGroup ? ` · ${step.processFlowGroup}` : ""}
          </span>
          <h3 className="text-lg font-semibold text-gray-950 mt-1">{step.actionTitle}</h3>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">
          {STEP_TYPE_LABELS[step.stepType] ?? step.stepType}
        </Badge>
      </div>

      {/* SAP Content Section */}
      <div className="px-5 py-4 bg-gray-50">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          What SAP Best Practice Says
        </span>
        <div
          className="prose prose-sm max-w-none text-gray-950 mt-2"
          dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(step.actionInstructionsHtml) }}
        />
        {step.actionExpectedResult && (
          <div className="mt-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Expected Result
            </span>
            <div
              className="prose prose-sm max-w-none text-gray-600 italic mt-1"
              dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(step.actionExpectedResult) }}
            />
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
                <Badge className={`text-xs ${CATEGORY_STYLES[config.category] ?? "bg-gray-100 text-gray-600"}`}>
                  {config.category}
                </Badge>
                <span className="text-sm">{config.configItemName}</span>
                {config.selfService && (
                  <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                    Self-Service
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client Response Section */}
      <div className="px-5 py-4">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          How Does Your Company Do This?
        </span>

        {isReadOnly ? (
          <div className="mt-3">
            <p className="text-sm text-gray-500 italic">
              {step.fitStatus === "PENDING"
                ? "No response yet"
                : `Marked as ${step.fitStatus}`}
            </p>
            {step.clientNote && (
              <p className="mt-2 text-sm text-gray-700 bg-gray-50 p-3 rounded">
                {step.clientNote}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-col gap-3">
              {FIT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleFitStatusChange(opt.value)}
                  disabled={isItLead}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                    step.fitStatus === opt.value
                      ? opt.color
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  } ${isItLead ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                    step.fitStatus === opt.value ? "border-current" : "border-gray-300"
                  }`}>
                    {step.fitStatus === opt.value && (
                      <div className={`w-2 h-2 rounded-full ${opt.dotColor}`} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>

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
                <p className={`text-xs mt-1 ${gapNoteValid ? "text-gray-400" : "text-red-500"}`}>
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
              <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
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

      {/* Activity Context */}
      {step.activityTitle && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
          <div>
            <span className="text-xs text-gray-400">Activity</span>
            <p className="text-sm text-gray-600">{step.activityTitle}</p>
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
    </div>
  );
}
