"use client";

import { useCallback, useMemo, useState, memo } from "react";
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
  const handleSelectAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onBulkAction(area, "select_all");
    },
    [area, onBulkAction],
  );

  const handleDeselectAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onBulkAction(area, "deselect_all");
    },
    [area, onBulkAction],
  );

  // The previous defaultValue rule auto-opened any area with selections,
  // which in production caused the "Uncategorized" area (357 catalog items)
  // and "Finance" (98 items) to mount ~455 ScopeItemCards on initial render
  // for the Bursa assessment alone — ~9,000 DOM nodes and a ~39,000-px
  // body that triggered the side-rail layout bug fixed in PR #27.
  //
  // Auto-open is now gated by a soft cap: areas with selections still open
  // automatically when they're small enough to render quickly; larger areas
  // stay collapsed (their selection count is still visible in the header)
  // and only mount their items when the user explicitly expands them.
  // Radix's Accordion uses Presence under the hood and unmounts content
  // on close, so a closed area mounts nothing.
  const initialOpen = useMemo(
    () =>
      selectedCount > 0 && totalCount <= AUTO_OPEN_ITEM_LIMIT ? [area] : [],
    [area, selectedCount, totalCount],
  );
  const [openItems, setOpenItems] = useState<string[]>(initialOpen);

  const handleValueChange = useCallback((val: string[]) => {
    setOpenItems(val);
  }, []);

  return (
    <Accordion type="multiple" value={openItems} onValueChange={handleValueChange}>
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
                <button
                  onClick={handleSelectAll}
                  className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={handleDeselectAll}
                  className="px-2 py-1 text-xs text-muted-foreground hover:bg-accent rounded transition-colors"
                >
                  Deselect All
                </button>
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
