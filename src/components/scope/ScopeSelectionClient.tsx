"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import { Search, ArrowLeft, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScopeAreaGroup } from "@/components/scope/ScopeAreaGroup";
import { ScopeProgress } from "@/components/scope/ScopeProgress";
import { EmptyState } from "@/components/shared/EmptyState";
import { UI_TEXT } from "@/constants/ui-text";

interface ScopeItemData {
  id: string;
  name: string;
  nameClean: string;
  country: string;
  totalSteps: number;
  functionalArea: string;
  subArea: string;
  configCount: number;
  tutorialUrl: string | null;
  purposeHtml: string;
  overviewHtml: string;
  prerequisitesHtml: string;
  setupPdfStored: boolean;
  selected: boolean;
  relevance: string | null;
  currentState: string | null;
  notes: string | null;
  respondent: string | null;
  respondedAt: string | null;
}

interface SelectionPayload {
  selected: boolean;
  relevance: string;
  currentState?: string | null;
  notes?: string | null;
}

interface ScopeSelectionClientProps {
  assessmentId: string;
  industry: string;
  assessmentStatus: string;
  scopeItems: ScopeItemData[];
  industryPreSelections: string[];
}

type FilterMode = "all" | "selected" | "not_selected" | "maybe";

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
  { value: "all", label: UI_TEXT.scope.filterAll },
  { value: "selected", label: UI_TEXT.scope.filterSelected },
  { value: "not_selected", label: UI_TEXT.scope.filterNotSelected },
  { value: "maybe", label: UI_TEXT.scope.filterMaybe },
];

export function ScopeSelectionClient({
  assessmentId,
  industry,
  assessmentStatus,
  scopeItems: initialItems,
  industryPreSelections,
}: ScopeSelectionClientProps) {
  const [items, setItems] = useState<ScopeItemData[]>(initialItems);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const pendingSaves = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Group items by functional area
  const functionalAreas = useMemo(() => {
    const areas = new Set<string>();
    for (const item of items) {
      areas.add(item.functionalArea);
    }
    return Array.from(areas).sort();
  }, [items]);

  // Apply filters
  const filteredItems = useMemo(() => {
    let result = items;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.nameClean.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.subArea.toLowerCase().includes(q) ||
          item.functionalArea.toLowerCase().includes(q),
      );
    }

    // Relevance/selection filter
    if (filterMode === "selected") {
      result = result.filter((item) => item.selected);
    } else if (filterMode === "not_selected") {
      result = result.filter((item) => !item.selected);
    } else if (filterMode === "maybe") {
      result = result.filter((item) => item.relevance === "MAYBE");
    }

    // Area filter
    if (areaFilter !== "all") {
      result = result.filter((item) => item.functionalArea === areaFilter);
    }

    return result;
  }, [items, searchQuery, filterMode, areaFilter]);

  // Group filtered items by area
  const groupedItems = useMemo(() => {
    const groups = new Map<string, ScopeItemData[]>();
    for (const item of filteredItems) {
      const existing = groups.get(item.functionalArea);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(item.functionalArea, [item]);
      }
    }
    return groups;
  }, [filteredItems]);

  // Progress stats
  const stats = useMemo(() => {
    const selected = items.filter((i) => i.selected);
    const totalStepsInScope = selected.reduce((sum, i) => sum + i.totalSteps, 0);
    const responded = items.filter((i) => i.relevance !== null).length;
    return {
      selectedCount: selected.length,
      totalCount: items.length,
      totalStepsInScope,
      respondedCount: responded,
    };
  }, [items]);

  // Debounced save to API
  const saveSelection = useCallback(
    (itemId: string, data: SelectionPayload) => {
      // Clear any pending save for this item
      const existing = pendingSaves.current.get(itemId);
      if (existing) clearTimeout(existing);

      const timeout = setTimeout(async () => {
        pendingSaves.current.delete(itemId);
        try {
          await fetch(`/api/assessments/${assessmentId}/scope/${itemId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
        } catch {
          // Silently fail — user can retry
        }
      }, 500);

      pendingSaves.current.set(itemId, timeout);
    },
    [assessmentId],
  );

  // Cleanup timeouts on unmount
  useEffect(() => {
    const saves = pendingSaves.current;
    return () => {
      for (const timeout of saves.values()) {
        clearTimeout(timeout);
      }
    };
  }, []);

  // Handle individual item selection change
  const handleSelectionChange = useCallback(
    (itemId: string, data: SelectionPayload) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                selected: data.selected,
                relevance: data.relevance,
                currentState: data.currentState ?? item.currentState,
                notes: data.notes !== undefined ? data.notes : item.notes,
              }
            : item,
        ),
      );
      saveSelection(itemId, data);
    },
    [saveSelection],
  );

  // Bulk select/deselect for a functional area
  const handleBulkAction = useCallback(
    async (area: string, action: "select_all" | "deselect_all") => {
      const areaItemIds = items
        .filter((i) => i.functionalArea === area)
        .map((i) => i.id);

      const selected = action === "select_all";
      const relevance = selected ? "YES" : "NO";

      // Optimistic update
      setItems((prev) =>
        prev.map((item) =>
          areaItemIds.includes(item.id)
            ? { ...item, selected, relevance }
            : item,
        ),
      );

      try {
        await fetch(`/api/assessments/${assessmentId}/scope/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            functionalArea: area,
          }),
        });
      } catch {
        // Revert on error — refresh the page
      }
    },
    [assessmentId, items],
  );

  const isReadOnly = assessmentStatus === "signed_off" || assessmentStatus === "reviewed";
  const industryPreSelectSet = useMemo(() => new Set(industryPreSelections), [industryPreSelections]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <PageHeader
        title={UI_TEXT.scope.title}
        description={UI_TEXT.scope.description.replace("{industry}", industry)}
        actions={
          <ScopeProgress
            selectedCount={stats.selectedCount}
            totalCount={stats.totalCount}
            totalStepsInScope={stats.totalStepsInScope}
            respondedCount={stats.respondedCount}
          />
        }
      />

      {/* Industry pre-selection banner */}
      {industryPreSelections.length > 0 && (
        <div className="mb-6 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          {UI_TEXT.scope.industryPreSelected.replace("{industry}", industry)}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={UI_TEXT.scope.searchPlaceholder}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterMode(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                filterMode === opt.value
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          value={areaFilter}
          onChange={(e) => setAreaFilter(e.target.value)}
          className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700"
        >
          <option value="all">All Areas</option>
          {functionalAreas.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
      </div>

      {/* Scope items grouped by area */}
      {groupedItems.size === 0 ? (
        <EmptyState
          title={UI_TEXT.scope.noResults}
          description={UI_TEXT.scope.noResultsDescription}
        />
      ) : (
        <div className="space-y-2">
          {Array.from(groupedItems.entries()).map(([area, areaItems]) => {
            const allAreaItems = items.filter((i) => i.functionalArea === area);
            const selectedInArea = allAreaItems.filter((i) => i.selected).length;
            return (
              <ScopeAreaGroup
                key={area}
                area={area}
                items={areaItems}
                selectedCount={selectedInArea}
                totalCount={allAreaItems.length}
                onSelectionChange={handleSelectionChange}
                onBulkAction={handleBulkAction}
                industryPreSelectSet={industryPreSelectSet}
                isReadOnly={isReadOnly}
              />
            );
          })}
        </div>
      )}

      {/* Action bar */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mt-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href={`/assessments`}>
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              {UI_TEXT.scope.backButton.replace("← ", "")}
            </Button>
          </Link>

          <div className="text-center">
            <p className="text-base font-semibold text-gray-950">
              {stats.selectedCount} scope items selected
            </p>
            <p className="text-sm text-gray-600">
              {stats.totalStepsInScope} process steps to review
            </p>
          </div>

          <Link href={`/assessment/${assessmentId}/review`}>
            <Button>
              {UI_TEXT.scope.continueButton.replace(" →", "")}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
