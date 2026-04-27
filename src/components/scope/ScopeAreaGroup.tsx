"use client";

import { useCallback, useMemo, memo } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { ScopeItemCard, type ScopeItemWarning } from "@/components/scope/ScopeItemCard";

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
}

interface SelectionPayload {
  selected: boolean;
  relevance: string;
  currentState?: string | null;
  notes?: string | null;
}

/**
 * Areas with selections auto-open at this size or smaller. Larger areas
 * stay collapsed even if they have selections so the page doesn't mount
 * hundreds of ScopeItemCards on initial render. Tunable.
 */
const AUTO_OPEN_ITEM_LIMIT = 50;

interface ScopeAreaGroupProps {
  area: string;
  items: ScopeItemData[];
  selectedCount: number;
  totalCount: number;
  onSelectionChange: (itemId: string, data: SelectionPayload) => void;
  onBulkAction: (area: string, action: "select_all" | "deselect_all") => void;
  industryPreSelectSet: Set<string>;
  isReadOnly: boolean;
  onOpenBriefing?: ((itemId: string) => void) | undefined;
  warningsByScope?: Map<string, ScopeItemWarning[]>;
}

export const ScopeAreaGroup = memo(function ScopeAreaGroup({
  area,
  items,
  selectedCount,
  totalCount,
  onSelectionChange,
  onBulkAction,
  industryPreSelectSet,
  isReadOnly,
  onOpenBriefing,
  warningsByScope,
}: ScopeAreaGroupProps) {
  // Bulk-action triggers used to be <button>s nested inside the
  // AccordionTrigger's own <button>. In React 19 / Next 15 that's a
  // fatal hydration error ("button cannot contain a nested button"),
  // which produced an infinite re-render loop on /scope and made
  // every link click — including the Requirements sub-tab — net::
  // ERR_ABORTED. They're now <span role="button"> inside the trigger,
  // which is valid HTML and accessible (keyboard handler below).
  const handleSelectAll = useCallback(
    (e: React.SyntheticEvent) => {
      e.stopPropagation();
      onBulkAction(area, "select_all");
    },
    [area, onBulkAction],
  );

  const handleDeselectAll = useCallback(
    (e: React.SyntheticEvent) => {
      e.stopPropagation();
      onBulkAction(area, "deselect_all");
    },
    [area, onBulkAction],
  );

  const onKeyActivate = useCallback(
    (fn: (e: React.SyntheticEvent) => void) =>
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fn(e);
        }
      },
    [],
  );

  // Auto-open is gated by a soft cap so areas with hundreds of items
  // (e.g. "Uncategorized" at 357 in the catalog) don't mount all their
  // ScopeItemCards on initial render even when they have selections.
  // Default uncontrolled — going controlled triggered an infinite-
  // re-render loop in some scenarios; the auto-open cap is sufficient
  // for the perf goal without controlling the accordion state.
  const defaultOpen = useMemo(
    () =>
      selectedCount > 0 && totalCount <= AUTO_OPEN_ITEM_LIMIT ? [area] : [],
    [area, selectedCount, totalCount],
  );

  return (
    <Accordion type="multiple" defaultValue={defaultOpen}>
      <AccordionItem value={area} className="border rounded-lg bg-card">
        <AccordionTrigger className="px-5 hover:no-underline">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="flex-1 min-w-0 text-left">
              <span className="text-lg font-semibold text-foreground">{area}</span>
              <span className="ml-3 text-xs text-muted-foreground">
                {selectedCount} / {totalCount} selected
              </span>
            </div>
            <div className="w-24">
              <ProgressBar value={selectedCount} max={totalCount} />
            </div>
            {!isReadOnly && (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleSelectAll}
                  onKeyDown={onKeyActivate(handleSelectAll)}
                  className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer select-none"
                >
                  Select All
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleDeselectAll}
                  onKeyDown={onKeyActivate(handleDeselectAll)}
                  className="px-2 py-1 text-xs text-muted-foreground hover:bg-accent rounded transition-colors cursor-pointer select-none"
                >
                  Deselect All
                </span>
              </div>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-5">
          {items.map((item) => (
            <ScopeItemCard
              key={item.id}
              item={item}
              onSelectionChange={onSelectionChange}
              isPreSelected={industryPreSelectSet.has(item.id)}
              onOpenBriefing={onOpenBriefing}
              warnings={warningsByScope?.get(item.id)}
            />
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
});
