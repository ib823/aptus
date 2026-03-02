"use client";

import { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getScopeItemMetadata,
  getActivityMetadata,
  type ScopeItemModuleInfo,
  type ScopeItemMasterData,
  type ScopeItemDependency,
  type ActivityMetadata,
  type ScopeItemMetadata,
  type ClassificationImplication,
} from "@/constants/scope-item-metadata";

// --- Assembled data shape ---

interface ImplicationsData {
  modules: ScopeItemModuleInfo[];
  configAreas: string[];
  masterData: ScopeItemMasterData[];
  dependencies: ScopeItemDependency[];
  effort: "low" | "medium" | "high";
  implications: ClassificationImplication | null;
}

// --- Props ---

interface ImplicationsPanelProps {
  fitStatus: string;
  scopeItemId: string;
  activityTitle: string;
  activityMetadata?: ActivityMetadata | null | undefined;
  scopeItemMetadata?: ScopeItemMetadata | null | undefined;
  implications?: ClassificationImplication | null | undefined;
  configs?: Array<{ id: string; configItemName: string; category: string; selfService: boolean }> | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}

// --- Data assembly ---

function assembleImplicationsData(
  fitStatus: string,
  scopeItemId: string,
  activityTitle: string,
  actMetaOverride?: ActivityMetadata | null | undefined,
  scopeMetaOverride?: ScopeItemMetadata | null | undefined,
): ImplicationsData {
  const scopeMeta = scopeMetaOverride ?? getScopeItemMetadata(scopeItemId);
  const actMeta = actMetaOverride ?? getActivityMetadata(scopeItemId, activityTitle);

  const modules = actMeta?.modules
    ? scopeMeta?.modules.filter((m) => actMeta.modules.includes(m.code)) ?? []
    : scopeMeta?.modules ?? [];

  const configAreas = actMeta?.configAreas ?? [];

  const masterData = actMeta?.masterDataNeeded
    ? scopeMeta?.masterData.filter((md) =>
        actMeta.masterDataNeeded.includes(md.objectName),
      ) ?? []
    : scopeMeta?.masterData ?? [];

  const dependencies = scopeMeta?.dependencies ?? [];

  // Escalate effort for GAP (any → next tier) and CONFIGURE (low → medium only)
  let effort = actMeta?.effortCategory ?? "medium";
  if (fitStatus === "GAP" && effort !== "high") {
    effort = effort === "low" ? "medium" : "high";
  } else if (fitStatus === "CONFIGURE" && effort === "low") {
    effort = "medium";
  }

  const implications = scopeMeta?.defaultImplications ?? null;

  return { modules, configAreas, masterData, dependencies, effort, implications };
}

// --- Effort badge ---

const EFFORT_STYLES: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-red-100 text-red-700",
};

const EFFORT_LABELS: Record<string, string> = {
  low: "Low Effort",
  medium: "Medium Effort",
  high: "High Effort",
};

// --- Panel header config per status ---

const STATUS_CONFIG: Record<string, { icon: string; label: string; color: string; bgColor: string; borderColor: string }> = {
  FIT: { icon: "\u2713", label: "Standard Implementation", color: "text-green-700", bgColor: "bg-green-50", borderColor: "border-green-200" },
  CONFIGURE: { icon: "\u2699", label: "Configuration Required", color: "text-blue-700", bgColor: "bg-blue-50", borderColor: "border-blue-200" },
  GAP: { icon: "\u26A0", label: "Custom Development / Alternative", color: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200" },
  NA: { icon: "\u2014", label: "Out of Scope", color: "text-slate-600", bgColor: "bg-slate-50", borderColor: "border-slate-200" },
};

// --- Component ---

export function ImplicationsPanel({
  fitStatus,
  scopeItemId,
  activityTitle,
  activityMetadata: actMetaProp,
  scopeItemMetadata: scopeMetaProp,
  implications: implicationsProp,
  isExpanded,
  onToggle,
}: ImplicationsPanelProps) {
  const data = useMemo(
    () => assembleImplicationsData(fitStatus, scopeItemId, activityTitle, actMetaProp, scopeMetaProp),
    [fitStatus, scopeItemId, activityTitle, actMetaProp, scopeMetaProp],
  );

  const implications = implicationsProp ?? data.implications;
  const statusCfg = STATUS_CONFIG[fitStatus];

  // Don't render for PENDING
  if (fitStatus === "PENDING" || !statusCfg) return null;

  const descriptionText =
    fitStatus === "FIT" ? implications?.fitDescription
    : fitStatus === "CONFIGURE" ? implications?.configureDescription
    : fitStatus === "GAP" ? implications?.gapDescription
    : fitStatus === "NA" ? implications?.naDescription
    : null;

  return (
    <div className={`rounded-lg border ${statusCfg.borderColor} overflow-hidden mt-3`}>
      {/* Toggle header */}
      <button
        onClick={onToggle}
        className={`w-full px-4 py-2.5 flex items-center justify-between ${statusCfg.bgColor} hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className={`w-4 h-4 ${statusCfg.color}`} />
          ) : (
            <ChevronRight className={`w-4 h-4 ${statusCfg.color}`} />
          )}
          <span className={`text-sm font-medium ${statusCfg.color}`}>
            {statusCfg.icon} {statusCfg.label}
          </span>
        </div>
        {fitStatus !== "NA" && (
          <Badge className={`text-xs ${EFFORT_STYLES[data.effort] ?? ""}`}>
            {EFFORT_LABELS[data.effort] ?? data.effort}
          </Badge>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 py-3 space-y-4 bg-card">
          {/* Description */}
          {descriptionText && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {descriptionText}
            </p>
          )}

          {/* GAP impact indicator */}
          {fitStatus === "GAP" && (
            <p className="text-xs text-amber-600">
              {data.effort === "high"
                ? "Significant impact on implementation timeline and budget."
                : "Moderate impact on implementation timeline."}
            </p>
          )}

          {/* NA-specific: impact warning */}
          {fitStatus === "NA" && implications?.naImpact && (
            <div className="p-3 bg-amber-50 rounded-md border border-amber-200">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                Impact of Excluding
              </span>
              <p className="text-sm text-amber-700 mt-1">
                {implications.naImpact}
              </p>
              <p className="text-xs text-amber-600 mt-1 italic">
                This decision can be changed at any time during the assessment period.
              </p>
            </div>
          )}

          {/* Modules + Config grid (not for NA) */}
          {fitStatus !== "NA" && (data.modules.length > 0 || data.configAreas.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Modules */}
              {data.modules.length > 0 && (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Affected Modules
                  </span>
                  <ul className="mt-1.5 space-y-1">
                    {data.modules.map((m) => (
                      <li key={m.code} className="text-sm text-foreground flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                          {m.code}
                        </Badge>
                        <span>{m.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Config areas (FIT/CONFIGURE) or RICEFW (GAP) */}
              {fitStatus === "GAP" ? (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    RICEFW Considerations
                  </span>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    A gap resolution workshop will determine whether this requires a Report, Interface, Conversion, Enhancement, Form, or Workflow (RICEFW) object.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {["Configuration Change", "Custom Development", "BTP Extension", "Third-Party Solution", "Process Adaptation"].map((opt) => (
                      <span key={opt} className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        {opt}
                      </span>
                    ))}
                  </div>
                  {data.configAreas.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {data.configAreas.map((area) => (
                        <li key={area} className="text-sm text-foreground flex items-center gap-2">
                          <span className="text-muted-foreground/50">&bull;</span>
                          {area}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : data.configAreas.length > 0 ? (
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {fitStatus === "CONFIGURE" ? "Areas Needing Adjustment" : "Configuration Areas"}
                  </span>
                  <ul className="mt-1.5 space-y-1">
                    {data.configAreas.map((area) => (
                      <li key={area} className="text-sm text-foreground flex items-center gap-2">
                        <span className="text-muted-foreground/50">&bull;</span>
                        {area}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          {/* Master Data (not for NA) */}
          {fitStatus !== "NA" && data.masterData.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Master Data Required
              </span>
              <ul className="mt-1.5 space-y-1.5">
                {data.masterData.map((md) => (
                  <li key={md.objectName} className="text-sm text-foreground">
                    <span className="font-medium">{md.objectName}</span>
                    {md.sapCode && (
                      <Badge variant="outline" className="text-[10px] font-mono ml-1.5">
                        {md.sapCode}
                      </Badge>
                    )}
                    <span className="text-muted-foreground"> &mdash; {md.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dependencies */}
          {data.dependencies.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {fitStatus === "NA" ? "Related Decisions" : "Scope Dependencies"}
              </span>
              <ul className="mt-1.5 space-y-1.5">
                {data.dependencies.map((dep) => (
                  <li key={dep.scopeItemId} className="text-sm text-foreground flex items-start gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono shrink-0 mt-0.5 ${
                        dep.type === "required"
                          ? "border-red-200 text-red-600"
                          : dep.type === "recommended"
                            ? "border-amber-200 text-amber-600"
                            : "border-slate-200 text-slate-500"
                      }`}
                    >
                      {dep.scopeItemId}
                    </Badge>
                    <div>
                      <span className="font-medium">{dep.name}</span>
                      <span className="text-muted-foreground/60 text-xs ml-1">({dep.type})</span>
                      {fitStatus === "NA" ? (
                        <p className="text-muted-foreground text-xs mt-0.5">
                          Verify that {dep.name} covers this scenario if it is in scope.
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-xs mt-0.5">{dep.reason}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What Happens Next */}
          <div className="mt-4 pt-3 border-t border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              What Happens Next
            </span>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              {fitStatus === "FIT" &&
                "This process will be activated using SAP standard configuration during implementation. No custom development is needed."}
              {fitStatus === "CONFIGURE" &&
                "Your configuration needs will be documented in the Configuration Workbook. The implementation team will adjust SAP settings to match your process."}
              {fitStatus === "GAP" &&
                "This gap will be added to the Gap Register. A resolution workshop will determine the best approach — configuration changes, custom development, a third-party solution, or process adaptation."}
              {fitStatus === "NA" &&
                "This process will not be included in the SAP implementation. You can revisit this decision at any time during the assessment."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export assembly for testing
export { assembleImplicationsData };
export type { ImplicationsData };
