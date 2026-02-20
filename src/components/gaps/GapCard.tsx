"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface GapData {
  id: string;
  gapDescription: string;
  resolutionType: string;
  resolutionDescription: string;
  effortDays: number | null;
  riskLevel: string | null;
  upgradeImpact: string | null;
  rationale: string | null;
  clientApproved: boolean;
  processStep: {
    id: string;
    actionTitle: string;
    sequence: number;
    processFlowGroup: string | null;
  } | null;
  scopeItem: {
    id: string;
    nameClean: string;
    functionalArea: string;
  } | null;
  clientNote: string | null;
}

interface GapCardProps {
  gap: GapData;
  onUpdate: (gapId: string, data: {
    resolutionType: string;
    resolutionDescription?: string | undefined;
    effortDays?: number | undefined;
    riskLevel?: string | undefined;
    rationale?: string | undefined;
  }) => void;
  isReadOnly: boolean;
}

const RESOLUTION_OPTIONS = [
  { value: "FIT", label: "Fits After All", description: "On closer look, SAP handles this", color: "bg-green-50 border-green-200 text-green-700" },
  { value: "CONFIGURE", label: "Configure", description: "Standard SAP configuration will address this", color: "bg-blue-50 border-blue-200 text-blue-700" },
  { value: "KEY_USER_EXT", label: "Key User Extension", description: "Low-code extension by key users", color: "bg-cyan-50 border-cyan-200 text-cyan-700" },
  { value: "BTP_EXT", label: "BTP Extension", description: "Custom logic on SAP BTP", color: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  { value: "ISV", label: "ISV Solution", description: "Third-party software from SAP Store", color: "bg-violet-50 border-violet-200 text-violet-700" },
  { value: "CUSTOM_ABAP", label: "Custom ABAP", description: "Custom development in SAP", color: "bg-red-50 border-red-200 text-red-700" },
  { value: "ADAPT_PROCESS", label: "Adapt Process", description: "Change business process to match SAP", color: "bg-amber-50 border-amber-200 text-amber-700" },
  { value: "OUT_OF_SCOPE", label: "Out of Scope", description: "Defer to a later phase", color: "bg-gray-50 border-gray-200 text-gray-600" },
] as const;

const RISK_COLORS: Record<string, string> = {
  LOW: "bg-green-100 text-green-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-red-100 text-red-700",
};

export function GapCard({ gap, onUpdate, isReadOnly }: GapCardProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [localRationale, setLocalRationale] = useState<{ gapId: string; value: string }>({
    gapId: gap.id,
    value: gap.rationale ?? "",
  });
  const displayRationale = localRationale.gapId === gap.id ? localRationale.value : (gap.rationale ?? "");

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleResolutionSelect = (resolutionType: string) => {
    if (isReadOnly) return;
    onUpdate(gap.id, {
      resolutionType,
      rationale: displayRationale || undefined,
    });
  };

  const handleRationaleChange = (value: string) => {
    setLocalRationale({ gapId: gap.id, value });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate(gap.id, {
        resolutionType: gap.resolutionType,
        rationale: value || undefined,
      });
    }, 1000);
  };

  const needsRationale = gap.resolutionType !== "PENDING" && gap.resolutionType !== "FIT";
  const rationaleValid = !needsRationale || displayRationale.length >= 20;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400">
                {gap.scopeItem?.id}
              </span>
              <span className="text-sm font-semibold text-gray-950">
                {gap.scopeItem?.nameClean}
              </span>
            </div>
            <p className="text-base font-semibold text-gray-950 mt-1">
              {gap.processStep?.actionTitle ?? "Gap"}
            </p>
            {gap.processStep?.processFlowGroup && (
              <span className="text-xs text-gray-400">
                Step {(gap.processStep.sequence ?? 0) + 1} · {gap.processStep.processFlowGroup}
              </span>
            )}
          </div>
          {gap.riskLevel && (
            <Badge className={RISK_COLORS[gap.riskLevel] ?? "bg-gray-100 text-gray-600"}>
              {gap.riskLevel} Risk
            </Badge>
          )}
        </div>
      </div>

      {/* Gap context */}
      <div className="px-5 py-4 bg-amber-50/50">
        <div>
          <span className="text-xs font-medium text-amber-600 uppercase tracking-wider">
            What the Client Needs
          </span>
          <p className="text-sm text-gray-700 mt-1">{gap.clientNote ?? gap.gapDescription}</p>
        </div>
        {gap.gapDescription && gap.clientNote && gap.gapDescription !== gap.clientNote && (
          <div className="mt-3">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Gap Description
            </span>
            <p className="text-sm text-gray-600 mt-1">{gap.gapDescription}</p>
          </div>
        )}
      </div>

      {/* Resolution options */}
      <div className="px-5 py-4">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          Resolution Approach
        </span>

        {isReadOnly ? (
          <div className="mt-3">
            <p className="text-sm font-medium">
              {RESOLUTION_OPTIONS.find((o) => o.value === gap.resolutionType)?.label ?? gap.resolutionType}
            </p>
            {gap.rationale && (
              <p className="mt-2 text-sm text-gray-600 bg-gray-50 p-3 rounded">{gap.rationale}</p>
            )}
          </div>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {RESOLUTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleResolutionSelect(opt.value)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    gap.resolutionType === opt.value
                      ? opt.color
                      : "bg-white border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                </button>
              ))}
            </div>

            {/* Rationale */}
            {needsRationale && (
              <div className="mt-4">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rationale (Required)
                </label>
                <Textarea
                  value={displayRationale}
                  onChange={(e) => handleRationaleChange(e.target.value)}
                  placeholder="Explain why this resolution approach was chosen (min 20 characters)..."
                  className="mt-2 min-h-[72px]"
                  required
                />
                <p className={`text-xs mt-1 ${rationaleValid ? "text-gray-400" : "text-red-500"}`}>
                  {displayRationale.length} / 20 minimum characters
                </p>
              </div>
            )}

            {/* Effort/cost display */}
            {gap.effortDays !== null && gap.effortDays > 0 && (
              <div className="mt-3 flex items-center gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Effort:</span>{" "}
                  <span className="font-medium">{gap.effortDays} days</span>
                </div>
                {gap.upgradeImpact && (
                  <div>
                    <span className="text-gray-400">Upgrade Impact:</span>{" "}
                    <span className="font-medium text-amber-600">{gap.upgradeImpact}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
