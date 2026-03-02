"use client";

import { useState, useCallback, useEffect, memo } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { sanitizeHtmlContent } from "@/lib/security/sanitize";
import { extractScopeSummary } from "@/lib/assessment/scope-summary";
import { getFirstSentence } from "@/constants/scope-summaries";

interface ScopeItemData {
  id: string;
  nameClean: string;
  totalSteps: number;
  subArea: string;
  configCount: number;
  tutorialUrl: string | null;
  purposeHtml?: string;
  overviewHtml?: string;
  prerequisitesHtml?: string;
  selected: boolean;
  relevance: string | null;
  currentState: string | null;
  notes: string | null;
  priority?: string | null;
  businessJustification?: string | null;
  estimatedComplexity?: string | null;
  dependsOnScopeItems?: string[];
  classifiableSteps?: number;
  effortDays?: number;
}

export interface ScopeItemWarning {
  missingScopeCode: string;
  missingScopeName: string;
  businessReason: string;
}

interface ScopeItemCardProps {
  item: ScopeItemData;
  assessmentId?: string;
  onSelectionChange: (itemId: string, data: {
    selected: boolean;
    relevance: string;
    currentState?: string | null;
    notes?: string | null;
    priority?: string | null;
    businessJustification?: string | null;
    estimatedComplexity?: string | null;
  }) => void;
  isPreSelected?: boolean | undefined;
  onOpenBriefing?: ((itemId: string) => void) | undefined;
  warnings?: ScopeItemWarning[];
}

interface ImpactData {
  totalSteps: number;
  classifiableSteps: number;
  configCount: number;
  effortBaseline: {
    complexity: string;
    implementationDays: number;
    configDays: number;
    testDays: number;
  } | null;
}

const RELEVANCE_OPTIONS = [
  { value: "YES", label: "Yes", style: "bg-green-100 text-green-700 border-green-300" },
  { value: "MAYBE", label: "Maybe", style: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "NO", label: "No", style: "bg-slate-50 text-slate-500 border-slate-200" },
] as const;

const CURRENT_STATE_OPTIONS = [
  { value: "MANUAL", label: "Manual (spreadsheets, paper, email)" },
  { value: "SYSTEM", label: "Existing System (current ERP or software)" },
  { value: "OUTSOURCED", label: "Outsourced (handled by a third party)" },
  { value: "NA", label: "Not Applicable (we don't do this)" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

const COMPLEXITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export const ScopeItemCard = memo(function ScopeItemCard({ item, assessmentId, onSelectionChange, isPreSelected, onOpenBriefing, warnings }: ScopeItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showEnrichment, setShowEnrichment] = useState(false);
  const [impact, setImpact] = useState<ImpactData | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [htmlContent, setHtmlContent] = useState<{
    purposeHtml: string;
    overviewHtml: string;
    prerequisitesHtml: string;
  } | null>(
    item.purposeHtml ? { purposeHtml: item.purposeHtml, overviewHtml: item.overviewHtml ?? "", prerequisitesHtml: item.prerequisitesHtml ?? "" } : null,
  );
  const [loadingHtml, setLoadingHtml] = useState(false);
  const relevance = item.relevance ?? "YES";

  // Fetch HTML content on first expand
  useEffect(() => {
    if (!expanded || htmlContent || loadingHtml) return;
    let cancelled = false;
    setLoadingHtml(true);
    fetch(`/api/catalog/scope-items/${item.id}/html`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.data) {
          setHtmlContent(json.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingHtml(false);
      });
    return () => { cancelled = true; };
  }, [expanded, htmlContent, loadingHtml, item.id]);

  const handleToggle = useCallback(() => {
    const newSelected = !item.selected;
    onSelectionChange(item.id, {
      selected: newSelected,
      relevance: newSelected ? "YES" : "NO",
      currentState: item.currentState,
      notes: item.notes,
    });
  }, [item, onSelectionChange]);

  const handleRelevanceChange = useCallback(
    (newRelevance: string) => {
      const selected = newRelevance !== "NO";
      onSelectionChange(item.id, {
        selected,
        relevance: newRelevance,
        currentState: item.currentState,
        notes: item.notes,
      });
    },
    [item, onSelectionChange],
  );

  const handleCurrentStateChange = useCallback(
    (value: string) => {
      onSelectionChange(item.id, {
        selected: item.selected,
        relevance,
        currentState: value,
        notes: item.notes,
      });
    },
    [item, relevance, onSelectionChange],
  );

  const handleNotesChange = useCallback(
    (notes: string) => {
      onSelectionChange(item.id, {
        selected: item.selected,
        relevance,
        currentState: item.currentState,
        notes: notes || null,
      });
    },
    [item, relevance, onSelectionChange],
  );

  const handlePriorityChange = useCallback(
    (value: string) => {
      onSelectionChange(item.id, {
        selected: item.selected,
        relevance,
        priority: value || null,
      });
    },
    [item, relevance, onSelectionChange],
  );

  const handleComplexityChange = useCallback(
    (value: string) => {
      onSelectionChange(item.id, {
        selected: item.selected,
        relevance,
        estimatedComplexity: value || null,
      });
    },
    [item, relevance, onSelectionChange],
  );

  const handleJustificationChange = useCallback(
    (value: string) => {
      onSelectionChange(item.id, {
        selected: item.selected,
        relevance,
        businessJustification: value || null,
      });
    },
    [item, relevance, onSelectionChange],
  );

  const fetchImpact = useCallback(async () => {
    if (impact || loadingImpact || !assessmentId) return;
    setLoadingImpact(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/scope/impact?scopeItemId=${item.id}`);
      if (res.ok) {
        const json = await res.json();
        setImpact(json.data);
      }
    } finally {
      setLoadingImpact(false);
    }
  }, [assessmentId, item.id, impact, loadingImpact]);

  return (
    <div className={`border-b border last:border-b-0 ${!item.selected && !isPreSelected ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3 py-4 px-1">
        <Checkbox
          checked={item.selected}
          onCheckedChange={handleToggle}
          aria-label={`Select ${item.nameClean}`}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-foreground truncate">
              {item.nameClean}
            </span>
            <span className="text-xs text-muted-foreground/60">({item.id})</span>
            {warnings && warnings.length > 0 && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded-full"
                title={`Depends on ${warnings.map((w) => w.missingScopeCode).join(", ")} — not selected`}
              >
                <AlertTriangle className="w-3 h-3" />
                {warnings.length}
              </span>
            )}
          </div>
          {getFirstSentence(item.id) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {getFirstSentence(item.id)}
            </p>
          )}
          <div className="flex items-center gap-4 mt-0.5 text-xs text-muted-foreground">
            <span>{item.classifiableSteps != null ? `${item.classifiableSteps} steps to review` : `${item.totalSteps} steps`}</span>
            <span>{item.subArea}</span>
            <span>{item.configCount} configs</span>
            {item.effortDays != null && item.effortDays > 0 && (
              <span>~{item.effortDays}d effort</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1" role="radiogroup" aria-label={`Relevance for ${item.nameClean}`}>
          {RELEVANCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              role="radio"
              aria-checked={relevance === opt.value}
              onClick={() => handleRelevanceChange(opt.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-all ${
                relevance === opt.value
                  ? opt.style
                  : "bg-card text-muted-foreground/60 border hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {item.selected && (
          <div className="flex flex-col items-end gap-0.5">
            <div className="flex items-center gap-1">
              <label className="text-[10px] font-medium text-muted-foreground">
                How do you do this today?
              </label>
              <span
                className="text-[10px] text-muted-foreground/50 cursor-help"
                title="Select how your company currently handles this process. This helps consultants understand your starting point."
              >
                &#9432;
              </span>
            </div>
            <Select value={item.currentState ?? ""} onValueChange={handleCurrentStateChange}>
              <SelectTrigger className="w-52 h-8 text-xs">
                <SelectValue placeholder="— Select —" />
              </SelectTrigger>
              <SelectContent>
                {CURRENT_STATE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {onOpenBriefing && (
          <button
            onClick={() => onOpenBriefing(item.id)}
            className="p-1 text-muted-foreground/50 hover:text-blue-500 transition-colors"
            aria-label={`View briefing for ${item.nameClean}`}
          >
            <Info className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>

      {expanded && (
        <div className="bg-muted/40 p-5 rounded-md mb-3 mx-1 border-t border">
          {loadingHtml ? (
            <div className="py-4 text-sm text-muted-foreground">Loading content...</div>
          ) : htmlContent ? (
            <Tabs defaultValue="purpose">
              <TabsList>
                <TabsTrigger value="purpose">Purpose</TabsTrigger>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="prerequisites">Prerequisites</TabsTrigger>
                {item.tutorialUrl && <TabsTrigger value="tutorial">Tutorial</TabsTrigger>}
              </TabsList>
              <TabsContent value="purpose" className="mt-3">
                {(() => {
                  const summary = extractScopeSummary(htmlContent.purposeHtml);
                  return summary ? (
                    <p className="text-sm text-muted-foreground mb-3">{summary}</p>
                  ) : null;
                })()}
                <div
                  className="prose prose-sm max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(htmlContent.purposeHtml) }}
                />
              </TabsContent>
              <TabsContent value="overview" className="mt-3">
                <div
                  className="prose prose-sm max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(htmlContent.overviewHtml) }}
                />
              </TabsContent>
              <TabsContent value="prerequisites" className="mt-3">
                <div
                  className="prose prose-sm max-w-none text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtmlContent(htmlContent.prerequisitesHtml) }}
                />
              </TabsContent>
              {item.tutorialUrl && (
                <TabsContent value="tutorial" className="mt-3">
                  <a
                    href={item.tutorialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-blue-500 hover:text-blue-600"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Tutorial
                  </a>
                </TabsContent>
              )}
            </Tabs>
          ) : (
            <div className="py-4 text-sm text-muted-foreground">No content available</div>
          )}

          {/* Enrichment section */}
          {item.selected && (
            <div className="mt-4 border-t pt-4">
              <button
                onClick={() => { setShowEnrichment(!showEnrichment); if (!showEnrichment) fetchImpact(); }}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {showEnrichment ? "Hide Details" : "Show Priority & Impact"}
              </button>
              {showEnrichment && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Priority</label>
                      <Select value={item.priority ?? ""} onValueChange={handlePriorityChange}>
                        <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Set priority" /></SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Complexity</label>
                      <Select value={item.estimatedComplexity ?? ""} onValueChange={handleComplexityChange}>
                        <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Estimate" /></SelectTrigger>
                        <SelectContent>
                          {COMPLEXITY_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Business Justification</label>
                    <Textarea
                      value={item.businessJustification ?? ""}
                      onChange={(e) => handleJustificationChange(e.target.value)}
                      placeholder="Why is this scope item needed?"
                      className="mt-1 text-sm"
                      rows={2}
                    />
                  </div>
                  {/* Impact Preview */}
                  {loadingImpact && <p className="text-xs text-muted-foreground">Loading impact data...</p>}
                  {impact && (
                    <div className="grid grid-cols-3 gap-2 p-3 bg-blue-50/50 rounded-md border border-blue-100">
                      <div className="text-center">
                        <p className="text-lg font-bold text-foreground">{impact.classifiableSteps}</p>
                        <p className="text-xs text-muted-foreground">Review Steps</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-foreground">{impact.configCount}</p>
                        <p className="text-xs text-muted-foreground">Config Items</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-foreground">
                          {impact.effortBaseline?.implementationDays ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">Est. Days</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
            <label htmlFor={`notes-${item.id}`} className="block text-xs font-medium text-muted-foreground mb-1">
              Notes about this scope item
            </label>
            <Textarea
              id={`notes-${item.id}`}
              value={item.notes ?? ""}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Notes about this scope item..."
              className="text-sm"
              rows={2}
            />
          </div>
        </div>
      )}
    </div>
  );
});
