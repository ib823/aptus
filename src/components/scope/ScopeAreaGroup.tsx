"use client";

import { useCallback } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { ScopeItemCard } from "@/components/scope/ScopeItemCard";

interface ScopeItemData {
  id: string;
  nameClean: string;
  totalSteps: number;
  subArea: string;
  configCount: number;
  tutorialUrl: string | null;
  purposeHtml: string;
  overviewHtml: string;
  prerequisitesHtml: string;
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

interface ScopeAreaGroupProps {
  area: string;
  items: ScopeItemData[];
  selectedCount: number;
  totalCount: number;
  onSelectionChange: (itemId: string, data: SelectionPayload) => void;
  onBulkAction: (area: string, action: "select_all" | "deselect_all") => void;
  industryPreSelectSet: Set<string>;
  isReadOnly: boolean;
}

export function ScopeAreaGroup({
  area,
  items,
  selectedCount,
  totalCount,
  onSelectionChange,
  onBulkAction,
  industryPreSelectSet,
  isReadOnly,
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

  return (
    <Accordion type="multiple" defaultValue={[area]}>
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
            />
          ))}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
