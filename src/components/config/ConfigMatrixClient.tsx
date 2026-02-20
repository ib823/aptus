"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Search, ChevronDown, ChevronRight, FileText, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";

interface ConfigData {
  id: string;
  scopeItemId: string;
  scopeItemName: string;
  scopeItemDescription: string | null;
  configItemName: string;
  configItemId: string;
  activityDescription: string;
  selfService: boolean;
  configApproach: string | null;
  category: string;
  activityId: string;
  applicationArea: string;
  applicationSubarea: string;
  localizationScope: string | null;
  countrySpecific: string | null;
  redoInProduction: string | null;
  componentId: string | null;
  additionalInfo: string | null;
  setupPdfStored: boolean;
  included: boolean;
  excludeReason: string | null;
}

interface ConfigSummary {
  mandatory: number;
  recommended: number;
  optional: number;
  total: number;
  selfService: number;
  excludedRecommended: number;
  includedOptional: number;
}

interface ConfigMatrixClientProps {
  assessmentId: string;
  configs: ConfigData[];
  summary: ConfigSummary;
  readOnly?: boolean | undefined;
}

const CATEGORY_STYLES: Record<string, string> = {
  Mandatory: "bg-red-100 text-red-700",
  Recommended: "bg-amber-100 text-amber-700",
  Optional: "bg-gray-100 text-gray-600",
};

export function ConfigMatrixClient({
  assessmentId,
  configs: initialConfigs,
  summary: initialSummary,
  readOnly,
}: ConfigMatrixClientProps) {
  const [configs, setConfigs] = useState(initialConfigs);
  const [search, setSearch] = useState("");
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(
    new Set(["Mandatory", "Recommended"]),
  );
  const [selfServiceOnly, setSelfServiceOnly] = useState(false);
  const [scopeItemFilter, setScopeItemFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // Unique scope items for grouping filter
  const scopeItems = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of configs) {
      if (!map.has(c.scopeItemId)) {
        map.set(c.scopeItemId, c.scopeItemName);
      }
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [configs]);

  // Apply filters
  const filteredConfigs = useMemo(() => {
    let result = configs;

    if (categoryFilters.size > 0) {
      result = result.filter((c) => categoryFilters.has(c.category));
    }

    if (selfServiceOnly) {
      result = result.filter((c) => c.selfService);
    }

    if (scopeItemFilter) {
      result = result.filter((c) => c.scopeItemId === scopeItemFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.configItemName.toLowerCase().includes(q) ||
          c.activityDescription.toLowerCase().includes(q) ||
          c.scopeItemName.toLowerCase().includes(q) ||
          c.scopeItemId.toLowerCase().includes(q),
      );
    }

    return result;
  }, [configs, categoryFilters, selfServiceOnly, scopeItemFilter, search]);

  // Derive summary from current state
  const summary = useMemo(() => {
    const included = configs.filter((c) => c.included);
    const excludedRecommended = configs.filter((c) => c.category === "Recommended" && !c.included).length;
    const includedOptional = configs.filter((c) => c.category === "Optional" && c.included).length;
    return {
      ...initialSummary,
      excludedRecommended,
      includedOptional,
      includedCount: included.length,
    };
  }, [configs, initialSummary]);

  // Group by scope item for display counts
  const scopeItemCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of filteredConfigs) {
      map.set(c.scopeItemId, (map.get(c.scopeItemId) ?? 0) + 1);
    }
    return map;
  }, [filteredConfigs]);

  const toggleCategory = (category: string) => {
    setCategoryFilters((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleInclusion = async (configId: string, currentIncluded: boolean, excludeReason?: string | undefined) => {
    const newIncluded = !currentIncluded;

    // Optimistic update
    setConfigs((prev) =>
      prev.map((c) =>
        c.id === configId
          ? { ...c, included: newIncluded, excludeReason: newIncluded ? null : (excludeReason ?? null) }
          : c,
      ),
    );

    setSavingIds((prev) => new Set([...prev, configId]));

    try {
      const res = await fetch(`/api/assessments/${assessmentId}/config/${configId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          included: newIncluded,
          ...(newIncluded ? {} : { excludeReason }),
        }),
      });

      if (!res.ok) {
        // Revert on failure
        setConfigs((prev) =>
          prev.map((c) =>
            c.id === configId ? { ...c, included: currentIncluded } : c,
          ),
        );
      }
    } catch {
      // Revert on network error
      setConfigs((prev) =>
        prev.map((c) =>
          c.id === configId ? { ...c, included: currentIncluded } : c,
        ),
      );
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(configId);
        return next;
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="Configuration Matrix"
        description={`${summary.total} configuration activities for your selected scope items.`}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Mandatory" count={summary.mandatory} color="bg-red-500" description="Always included" />
        <SummaryCard label="Recommended" count={summary.recommended} color="bg-amber-500" description="Included by default" />
        <SummaryCard label="Optional" count={summary.optional} color="bg-gray-400" description="Excluded by default" />
        <SummaryCard label="Self-Service" count={summary.selfService} color="bg-green-500" description="No SAP support needed" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          {(["Mandatory", "Recommended", "Optional"] as const).map((cat) => (
            <label key={cat} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <Checkbox
                checked={categoryFilters.has(cat)}
                onCheckedChange={() => toggleCategory(cat)}
              />
              {cat}
            </label>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-sm cursor-pointer ml-2">
          <Checkbox
            checked={selfServiceOnly}
            onCheckedChange={() => setSelfServiceOnly(!selfServiceOnly)}
          />
          Self-Service Only
        </label>

        <select
          value={scopeItemFilter}
          onChange={(e) => setScopeItemFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-700"
        >
          <option value="">All Scope Items ({scopeItems.length})</option>
          {scopeItems.map(([id, name]) => (
            <option key={id} value={id}>
              {id} — {name} ({scopeItemCounts.get(id) ?? 0})
            </option>
          ))}
        </select>

        <div className="relative flex-1 max-w-sm ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search configurations..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Config table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Scope Item</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">Activity</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 w-28">Category</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 w-28">Self-Service</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 w-20">Include</th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {filteredConfigs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-sm text-gray-500">
                  No configurations match your filters
                </td>
              </tr>
            ) : (
              filteredConfigs.map((config) => (
                <ConfigRow
                  key={config.id}
                  config={config}
                  expanded={expandedId === config.id}
                  onToggle={() => setExpandedId(expandedId === config.id ? null : config.id)}
                  onToggleInclusion={toggleInclusion}
                  saving={savingIds.has(config.id)}
                  readOnly={readOnly}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-2">
        Showing {filteredConfigs.length} of {configs.length} configurations
      </p>

      {/* Action bar */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
        <Link href={`/assessment/${assessmentId}/gaps`}>
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Gap Resolution
          </Button>
        </Link>

        <div className="text-center">
          <p className="text-base font-semibold text-gray-950">
            {summary.includedCount} configurations included
          </p>
          {summary.excludedRecommended > 0 && (
            <p className="text-xs text-amber-600">
              {summary.excludedRecommended} recommended configs excluded
            </p>
          )}
        </div>

        <Link href={`/assessment/${assessmentId}/report`}>
          <Button>
            Continue to Report
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

function SummaryCard({ label, count, color, description }: {
  label: string;
  count: number;
  color: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-950 mt-1">{count}</p>
      <p className="text-xs text-gray-500">{description}</p>
    </div>
  );
}

function ConfigRow({ config, expanded, onToggle, onToggleInclusion, saving, readOnly }: {
  config: ConfigData;
  expanded: boolean;
  onToggle: () => void;
  onToggleInclusion: (id: string, included: boolean, reason?: string | undefined) => void;
  saving: boolean;
  readOnly?: boolean | undefined;
}) {
  const [excludeReason, setExcludeReason] = useState(config.excludeReason ?? "");

  const isMandatory = config.category === "Mandatory";

  return (
    <>
      <tr className={`border-b border-gray-100 hover:bg-gray-50 ${config.category === "Mandatory" ? "bg-red-50/30" : ""}`}>
        <td className="px-4 py-3">
          <span className="text-xs text-gray-400">{config.scopeItemId}</span>
          <p className="text-sm">{config.scopeItemName}</p>
        </td>
        <td className="px-4 py-3">
          <p className="text-sm font-medium">{config.configItemName}</p>
          <p className="text-xs text-gray-500 line-clamp-1">{config.activityDescription}</p>
        </td>
        <td className="px-4 py-3">
          <Badge className={CATEGORY_STYLES[config.category] ?? "bg-gray-100 text-gray-600"}>
            {config.category}
          </Badge>
        </td>
        <td className="px-4 py-3">
          {config.selfService ? (
            <Badge className="bg-green-100 text-green-700">Self-Service</Badge>
          ) : (
            <Badge variant="outline" className="text-gray-500">SAP Support</Badge>
          )}
        </td>
        <td className="px-4 py-3">
          {isMandatory ? (
            <div className="flex items-center gap-1 text-gray-400" title="Mandatory — always included">
              <Lock className="w-3.5 h-3.5" />
              <span className="text-xs">Required</span>
            </div>
          ) : (
            <Checkbox
              checked={config.included}
              disabled={readOnly || saving}
              onCheckedChange={() => {
                if (config.included) {
                  // Excluding — expand to show reason field
                  if (!expanded) onToggle();
                } else {
                  onToggleInclusion(config.id, config.included);
                }
              }}
            />
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {config.setupPdfStored && (
              <a
                href={`/api/catalog/setup-guide/${config.scopeItemId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-blue-500 hover:text-blue-600"
                title="View Setup Guide"
              >
                <FileText className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onToggle}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-gray-50 border-b border-gray-200">
            <div className="px-6 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Config Item ID" value={config.configItemId} />
                <Field label="Activity ID" value={config.activityId} />
                <Field label="Application Area" value={config.applicationArea} />
                <Field label="Application Subarea" value={config.applicationSubarea} />
                <Field label="Localization Scope" value={config.localizationScope ?? "Global"} />
                <Field label="Country Specific" value={config.countrySpecific ?? "No"} />
                <Field label="Redo in Production" value={config.redoInProduction ?? "No"} />
                <Field label="Component" value={config.componentId ?? "—"} />
              </div>
              {config.configApproach && (
                <div className="mt-4">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Configuration Approach</span>
                  <p className="text-sm text-gray-600 mt-1">{config.configApproach}</p>
                </div>
              )}
              {config.additionalInfo && (
                <div className="mt-3">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Additional Information</span>
                  <p className="text-sm text-gray-600 mt-1">{config.additionalInfo}</p>
                </div>
              )}

              {/* Exclusion reason for Recommended configs being excluded */}
              {!isMandatory && config.included && !readOnly && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => onToggleInclusion(config.id, config.included)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Exclude this configuration
                  </button>
                </div>
              )}
              {!isMandatory && !config.included && (
                <div className="mt-4 pt-3 border-t border-gray-200">
                  {config.category === "Recommended" && (
                    <div className="mb-3">
                      <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">
                        Reason for Excluding (Required)
                      </label>
                      <textarea
                        value={excludeReason}
                        onChange={(e) => setExcludeReason(e.target.value)}
                        placeholder="Why is this recommended configuration being excluded? (min 10 chars)"
                        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none h-20"
                        disabled={readOnly}
                      />
                    </div>
                  )}
                  <div className="flex gap-2">
                    {!readOnly && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onToggleInclusion(config.id, config.included, excludeReason || undefined)}
                          disabled={config.category === "Recommended" && excludeReason.trim().length < 10}
                        >
                          Confirm Exclude
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => onToggleInclusion(config.id, config.included)}
                        >
                          Include
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-gray-400">{label}</span>
      <p className="text-sm text-gray-700">{value}</p>
    </div>
  );
}
