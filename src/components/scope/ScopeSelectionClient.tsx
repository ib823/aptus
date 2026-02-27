"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ArrowLeft, ArrowRight, Map as MapIcon, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScopeAreaGroup } from "@/components/scope/ScopeAreaGroup";
import { ScopeProgress } from "@/components/scope/ScopeProgress";
import { EmptyState } from "@/components/shared/EmptyState";
import { ProcessLandscapeMap } from "@/components/scope/ProcessLandscapeMap";
import { ScopeItemBriefing } from "@/components/scope/ScopeItemBriefing";
import { UI_TEXT } from "@/constants/ui-text";
import {
  getLandscape,
  getAreaScopeItemIds,
  getChainScopeItemIds,
  type ProcessChain,
} from "@/constants/process-chains";
import type { HierarchyTree } from "@/types/hierarchy";

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
  purposeHtml?: string;
  overviewHtml?: string;
  prerequisitesHtml?: string;
  setupPdfStored: boolean;
  selected: boolean;
  relevance: string | null;
  currentState: string | null;
  notes: string | null;
  respondent: string | null;
  respondedAt: string | null;
  classifiableSteps?: number;
  effortDays?: number;
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
type ViewMode = "landscape" | "list";

interface ProcessAreaInfo {
  name: string;
  stepCount: number;
  classifiableCount: number;
}

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
  const router = useRouter();
  const [items, setItems] = useState<ScopeItemData[]>(initialItems);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [subAreaFilter, setSubAreaFilter] = useState<string>("all");
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("landscape");
  const [briefingItemId, setBriefingItemId] = useState<string | null>(null);
  const [briefingHierarchy, setBriefingHierarchy] = useState<ProcessAreaInfo[] | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const pendingSaves = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Group items by functional area
  const functionalAreas = useMemo(() => {
    const areas = new Set<string>();
    for (const item of items) {
      areas.add(item.functionalArea);
    }
    return Array.from(areas).sort();
  }, [items]);

  // Sub-areas for the selected area
  const subAreas = useMemo(() => {
    const subs = new Set<string>();
    const source = areaFilter !== "all" ? items.filter((i) => i.functionalArea === areaFilter) : items;
    for (const item of source) {
      subs.add(item.subArea);
    }
    return Array.from(subs).sort();
  }, [items, areaFilter]);

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

    // Sub-area filter
    if (subAreaFilter !== "all") {
      result = result.filter((item) => item.subArea === subAreaFilter);
    }

    return result;
  }, [items, searchQuery, filterMode, areaFilter, subAreaFilter]);

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

  // Set of filtered item IDs (for landscape dimming)
  const filteredItemIds = useMemo(() => {
    const hasActiveFilter = searchQuery.trim() || filterMode !== "all" || subAreaFilter !== "all";
    if (!hasActiveFilter) return new Set<string>();
    return new Set(filteredItems.map((i) => i.id));
  }, [filteredItems, searchQuery, filterMode, subAreaFilter]);

  // Progress stats
  const stats = useMemo(() => {
    const selected = items.filter((i) => i.selected);
    const totalStepsInScope = selected.reduce((sum, i) => sum + i.totalSteps, 0);
    const totalClassifiable = selected.reduce((sum, i) => sum + (i.classifiableSteps ?? 0), 0);
    const totalEffortDays = selected.reduce((sum, i) => sum + (i.effortDays ?? 0), 0);
    const responded = items.filter((i) => i.relevance !== null).length;
    return {
      selectedCount: selected.length,
      totalCount: items.length,
      totalStepsInScope,
      totalClassifiable,
      totalEffortDays,
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

  // REM-32: Bulk select/deselect for a process chain
  const handleBulkSelectChain = useCallback(
    async (chain: ProcessChain, action: "select_all" | "deselect_all") => {
      const scopeItemIds = getChainScopeItemIds(chain);
      const selected = action === "select_all";
      const relevance = selected ? "YES" : "NO";

      // Optimistic update
      setItems((prev) =>
        prev.map((item) =>
          scopeItemIds.includes(item.id)
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
            scopeItemIds,
          }),
        });
      } catch {
        // Silently fail
      }
    },
    [assessmentId],
  );

  const handleSelectChain = useCallback(
    (chain: ProcessChain) => handleBulkSelectChain(chain, "select_all"),
    [handleBulkSelectChain],
  );

  const handleClearChain = useCallback(
    (chain: ProcessChain) => handleBulkSelectChain(chain, "deselect_all"),
    [handleBulkSelectChain],
  );

  // REM-32: Toggle individual item from landscape view
  const handleLandscapeToggle = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;
      const newSelected = !item.selected;
      handleSelectionChange(itemId, {
        selected: newSelected,
        relevance: newSelected ? "YES" : "NO",
        currentState: item.currentState,
        notes: item.notes,
      });
    },
    [items, handleSelectionChange],
  );

  // Apply Industry Template
  const handleApplyTemplate = useCallback(async () => {
    if (applyingTemplate) return;
    setApplyingTemplate(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/scope/pre-select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industryCode: industry, mode: "merge" }),
      });
      if (res.ok) {
        const json = await res.json();
        const applied = json.data?.applied ?? 0;
        // Optimistic update — mark pre-selected items as selected
        if (applied > 0) {
          setItems((prev) =>
            prev.map((item) =>
              industryPreSelections.includes(item.id) && !item.selected
                ? { ...item, selected: true, relevance: "YES" }
                : item,
            ),
          );
        }
      }
    } finally {
      setApplyingTemplate(false);
    }
  }, [assessmentId, industry, industryPreSelections, applyingTemplate]);

  // REM-33: Open briefing for a scope item
  const handleOpenBriefing = useCallback(
    async (itemId: string) => {
      setBriefingItemId(itemId);
      setBriefingHierarchy(null);
      setBriefingLoading(true);

      try {
        const res = await fetch(`/api/catalog/scope-items/${itemId}/hierarchy`);
        if (res.ok) {
          const tree: HierarchyTree = await res.json();
          const areas: ProcessAreaInfo[] = tree.processes.map((p) => ({
            name: p.name,
            stepCount: p.flows.reduce(
              (sum, f) => sum + f.activities.reduce((s, a) => s + a.stepCount, 0),
              0,
            ),
            classifiableCount: p.flows.reduce(
              (sum, f) => sum + f.activities.reduce((s, a) => s + a.classifiableCount, 0),
              0,
            ),
          }));
          setBriefingHierarchy(areas);
        }
      } catch {
        // Hierarchy fetch failed — briefing still shows without process areas
      } finally {
        setBriefingLoading(false);
      }
    },
    [],
  );

  const handleCloseBriefing = useCallback(() => {
    setBriefingItemId(null);
    setBriefingHierarchy(null);
  }, []);

  const isReadOnly = assessmentStatus === "signed_off" || assessmentStatus === "reviewed";
  const industryPreSelectSet = useMemo(() => new Set(industryPreSelections), [industryPreSelections]);

  // REM-33: If briefing is open, render it as full-page replacement
  if (briefingItemId) {
    const briefingItem = items.find((i) => i.id === briefingItemId);
    if (briefingItem) {
      const totalClassifiable = briefingHierarchy
        ? briefingHierarchy.reduce((sum, a) => sum + a.classifiableCount, 0)
        : briefingItem.classifiableSteps ?? 0;

      return (
        <div className="max-w-5xl mx-auto">
          <ScopeItemBriefing
            scopeItemId={briefingItem.id}
            scopeItemName={briefingItem.nameClean}
            purposeHtml={briefingItem.purposeHtml}
            processAreas={briefingHierarchy ?? []}
            totalClassifiable={totalClassifiable}
            totalSteps={briefingItem.totalSteps}
            isSelected={briefingItem.selected}
            isLoading={briefingLoading}
            onStartReview={() => {
              router.push(`/assessment/${assessmentId}/review?scopeItem=${briefingItem.id}`);
            }}
            onBack={handleCloseBriefing}
            onToggleSelection={() => {
              handleLandscapeToggle(briefingItem.id);
            }}
          />
        </div>
      );
    }
  }

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
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={UI_TEXT.scope.searchPlaceholder}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-1" role="radiogroup" aria-label="Filter by selection status">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              role="radio"
              aria-checked={filterMode === opt.value}
              onClick={() => setFilterMode(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
                filterMode === opt.value
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-card text-muted-foreground border hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <select
          id="scope-area-filter"
          aria-label="Filter by functional area"
          value={areaFilter}
          onChange={(e) => { setAreaFilter(e.target.value); setSubAreaFilter("all"); }}
          className="h-9 px-3 text-xs border rounded-md bg-card text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <option value="all">All Areas</option>
          {functionalAreas.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>

        <select
          id="scope-sub-area-filter"
          aria-label="Filter by sub-area"
          value={subAreaFilter}
          onChange={(e) => setSubAreaFilter(e.target.value)}
          className="h-9 px-3 text-xs border rounded-md bg-card text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          <option value="all">All Sub-Areas</option>
          {subAreas.map((sub) => (
            <option key={sub} value={sub}>
              {sub}
            </option>
          ))}
        </select>

        {/* REM-32: View toggle */}
        <div className="flex items-center gap-0.5 border rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode("landscape")}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-all ${
              viewMode === "landscape"
                ? "bg-gray-900 text-white"
                : "bg-card text-muted-foreground hover:bg-accent"
            }`}
            aria-label={UI_TEXT.scope.viewLandscape}
          >
            <MapIcon className="w-3.5 h-3.5" />
            {UI_TEXT.scope.viewLandscape}
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-all ${
              viewMode === "list"
                ? "bg-gray-900 text-white"
                : "bg-card text-muted-foreground hover:bg-accent"
            }`}
            aria-label={UI_TEXT.scope.viewList}
          >
            <List className="w-3.5 h-3.5" />
            {UI_TEXT.scope.viewList}
          </button>
        </div>

        {industryPreSelections.length > 0 && !isReadOnly && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleApplyTemplate}
            disabled={applyingTemplate}
          >
            {applyingTemplate ? "Applying..." : "Apply Industry Template"}
          </Button>
        )}
      </div>

      {/* Impact summary bar */}
      {stats.selectedCount > 0 && (
        <div className="mb-6 grid grid-cols-4 gap-3">
          <div className="bg-card border rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-foreground">{stats.selectedCount}</p>
            <p className="text-xs text-muted-foreground">Scope Items</p>
          </div>
          <div className="bg-card border rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-foreground">{stats.totalStepsInScope}</p>
            <p className="text-xs text-muted-foreground">Total Steps</p>
          </div>
          <div className="bg-card border rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-foreground">{stats.totalClassifiable}</p>
            <p className="text-xs text-muted-foreground">Classifiable</p>
          </div>
          <div className="bg-card border rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-foreground">{stats.totalEffortDays > 0 ? `~${stats.totalEffortDays}d` : "\u2014"}</p>
            <p className="text-xs text-muted-foreground">Est. Effort</p>
          </div>
        </div>
      )}

      {/* Hero banner when nothing selected but industry templates available */}
      {stats.selectedCount === 0 && industryPreSelections.length > 0 && !isReadOnly && (
        <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-lg text-center">
          <h3 className="text-base font-semibold text-blue-800 mb-1">
            Get started with {industry} best practices
          </h3>
          <p className="text-sm text-blue-600 mb-3">
            We have {industryPreSelections.length} pre-selected scope items for the {industry} industry.
            Apply the template to get a head start.
          </p>
          <Button
            variant="default"
            onClick={handleApplyTemplate}
            disabled={applyingTemplate}
          >
            {applyingTemplate ? "Applying..." : "Apply Industry Template"}
          </Button>
        </div>
      )}

      {/* Scope items — landscape or list view */}
      {viewMode === "landscape" ? (
        // REM-32: Process Landscape Map view
        <>
          {functionalAreas.length === 0 ? (
            <EmptyState
              title={UI_TEXT.scope.noResults}
              description={UI_TEXT.scope.noResultsDescription}
            />
          ) : (
            functionalAreas.map((area) => {
              const landscape = getLandscape(area);
              const areaItems = items.filter((i) => i.functionalArea === area);

              if (landscape) {
                // Build item state map for this area
                const itemStates = new Map<string, { id: string; selected: boolean; nameClean: string }>();
                for (const item of areaItems) {
                  itemStates.set(item.id, { id: item.id, selected: item.selected, nameClean: item.nameClean });
                }

                // Find items not in any chain
                const chainItemIds = new Set(getAreaScopeItemIds(landscape));
                const otherItems = areaItems
                  .filter((i) => !chainItemIds.has(i.id))
                  .map((i) => ({ id: i.id, selected: i.selected, nameClean: i.nameClean }));

                return (
                  <ProcessLandscapeMap
                    key={area}
                    landscape={landscape}
                    itemStates={itemStates}
                    filteredIds={filteredItemIds}
                    otherItems={otherItems}
                    onToggle={handleLandscapeToggle}
                    onSelectChain={handleSelectChain}
                    onClearChain={handleClearChain}
                    onOpenBriefing={handleOpenBriefing}
                    isReadOnly={isReadOnly}
                  />
                );
              }

              // Fallback to list-style for areas without landscape data
              const selectedInArea = areaItems.filter((i) => i.selected).length;
              const filteredAreaItems = filteredItems.filter((i) => i.functionalArea === area);
              if (filteredAreaItems.length === 0 && filteredItemIds.size > 0) return null;

              return (
                <ScopeAreaGroup
                  key={area}
                  area={area}
                  items={filteredAreaItems.length > 0 ? filteredAreaItems : areaItems}
                  selectedCount={selectedInArea}
                  totalCount={areaItems.length}
                  onSelectionChange={handleSelectionChange}
                  onBulkAction={handleBulkAction}
                  industryPreSelectSet={industryPreSelectSet}
                  isReadOnly={isReadOnly}
                  onOpenBriefing={handleOpenBriefing}
                />
              );
            })
          )}
        </>
      ) : (
        // List view (original)
        <>
          {groupedItems.size === 0 ? (
            <EmptyState
              title={UI_TEXT.scope.noResults}
              description={UI_TEXT.scope.noResultsDescription}
            />
          ) : (
            <div className="space-y-2">
              {[...groupedItems.entries()].map(([area, areaItems]) => {
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
                    onOpenBriefing={handleOpenBriefing}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Action bar */}
      <div className="sticky bottom-0 bg-background border-t border -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mt-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link href={`/assessments`}>
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              {UI_TEXT.scope.backButton.replace("\u2190 ", "")}
            </Button>
          </Link>

          <div className="text-center">
            <p className="text-base font-semibold text-foreground">
              {stats.selectedCount} scope items selected
            </p>
            <p className="text-sm text-muted-foreground">
              {stats.totalStepsInScope} process steps to review
            </p>
          </div>

          <Link href={`/assessment/${assessmentId}/review`}>
            <Button>
              {UI_TEXT.scope.continueButton.replace(" \u2192", "")}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
