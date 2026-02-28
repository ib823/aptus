"use client";

import { memo, useMemo } from "react";
import { ArrowRight, Info, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { UI_TEXT } from "@/constants/ui-text";
import type {
  ChainStep,
  ProcessChain,
  FunctionalAreaLandscape,
} from "@/constants/process-chains";

// --- Types ---

interface ScopeItemState {
  id: string;
  selected: boolean;
  nameClean: string;
}

interface ChainStepCardProps {
  step: ChainStep;
  itemState: ScopeItemState | undefined;
  isDimmed: boolean;
  onToggle: (itemId: string) => void;
  onOpenBriefing?: ((itemId: string) => void) | undefined;
}

interface ProcessChainRowProps {
  chain: ProcessChain;
  itemStates: Map<string, ScopeItemState>;
  filteredIds: Set<string>;
  onToggle: (itemId: string) => void;
  onSelectChain: (chain: ProcessChain) => void;
  onClearChain: (chain: ProcessChain) => void;
  onOpenBriefing?: ((itemId: string) => void) | undefined;
  isReadOnly: boolean;
}

interface ProcessLandscapeMapProps {
  landscape: FunctionalAreaLandscape;
  itemStates: Map<string, ScopeItemState>;
  filteredIds: Set<string>;
  otherItems: ScopeItemState[];
  onToggle: (itemId: string) => void;
  onSelectChain: (chain: ProcessChain) => void;
  onClearChain: (chain: ProcessChain) => void;
  onOpenBriefing?: ((itemId: string) => void) | undefined;
  isReadOnly: boolean;
}

// --- ChainStepCard ---

const ChainStepCard = memo(function ChainStepCard({
  step,
  itemState,
  isDimmed,
  onToggle,
  onOpenBriefing,
}: ChainStepCardProps) {
  const isSelected = itemState?.selected ?? false;

  return (
    <div
      className={`relative w-40 rounded-lg border bg-card p-3 transition-all ${
        isSelected ? "border-l-[3px] border-l-green-500 border-t border-r border-b" : "border"
      } ${isDimmed ? "opacity-40" : ""}`}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">
          {step.scopeItemId}
        </Badge>
        <div className="flex items-center gap-0.5 shrink-0">
          {onOpenBriefing && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenBriefing(step.scopeItemId);
              }}
              className="p-0.5 text-muted-foreground/50 hover:text-blue-500 transition-colors"
              aria-label={`View briefing for ${step.businessName}`}
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          )}
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggle(step.scopeItemId)}
            aria-label={`Select ${step.businessName}`}
            className="h-3.5 w-3.5"
          />
        </div>
      </div>
      <p className="text-xs font-semibold text-foreground leading-tight mb-0.5">
        {step.businessName}
      </p>
      <p className="text-[10px] text-muted-foreground leading-tight">
        {step.roleInChain}
      </p>
    </div>
  );
});

// --- ProcessChainRow ---

const ProcessChainRow = memo(function ProcessChainRow({
  chain,
  itemStates,
  filteredIds,
  onToggle,
  onSelectChain,
  onClearChain,
  onOpenBriefing,
  isReadOnly,
}: ProcessChainRowProps) {
  const mainSteps = chain.steps.filter((s) => s.position !== "branch");
  const branchSteps = chain.steps.filter((s) => s.position === "branch");

  const chainItemIds = useMemo(
    () => chain.steps.map((s) => s.scopeItemId),
    [chain.steps],
  );

  const selectedCount = chainItemIds.filter(
    (id) => itemStates.get(id)?.selected,
  ).length;
  const totalCount = chainItemIds.length;
  const allSelected = selectedCount === totalCount;

  const typeBadgeStyle =
    chain.type === "core"
      ? "bg-blue-50 text-blue-700"
      : chain.type === "supporting"
        ? "bg-slate-50 text-slate-600"
        : "bg-purple-50 text-purple-700";

  return (
    <div className="mb-4 last:mb-0">
      {/* Chain header */}
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-sm font-semibold text-foreground">{chain.name}</h4>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
          {chain.abbreviation}
        </Badge>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeBadgeStyle}`}>
          {chain.type}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {UI_TEXT.scope.chainSelected
            .replace("{selected}", String(selectedCount))
            .replace("{total}", String(totalCount))}
        </span>
      </div>

      {/* Main step row */}
      <div className="flex items-center gap-1 flex-wrap">
        {mainSteps.map((step, idx) => (
          <div key={step.scopeItemId + "-" + idx} className="flex items-center gap-1">
            {idx > 0 && (
              <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
            )}
            <ChainStepCard
              step={step}
              itemState={itemStates.get(step.scopeItemId)}
              isDimmed={filteredIds.size > 0 && !filteredIds.has(step.scopeItemId)}
              onToggle={onToggle}
              onOpenBriefing={onOpenBriefing}
            />
          </div>
        ))}
      </div>

      {/* Branch items */}
      {branchSteps.length > 0 && (
        <div className="ml-8 mt-1 flex items-center gap-1 flex-wrap">
          <span className="text-muted-foreground/30 text-xs mr-1">&lfloor;</span>
          {branchSteps.map((step, idx) => (
            <div key={step.scopeItemId + "-branch-" + idx} className="flex items-center gap-1">
              {idx > 0 && (
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
              )}
              <ChainStepCard
                step={step}
                itemState={itemStates.get(step.scopeItemId)}
                isDimmed={filteredIds.size > 0 && !filteredIds.has(step.scopeItemId)}
                onToggle={onToggle}
                onOpenBriefing={onOpenBriefing}
              />
            </div>
          ))}
        </div>
      )}

      {/* Chain actions */}
      {!isReadOnly && (
        <div className="flex items-center gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => (allSelected ? onClearChain(chain) : onSelectChain(chain))}
          >
            {allSelected ? (
              <>{UI_TEXT.scope.clearChain}</>
            ) : (
              <>
                <Check className="w-3 h-3 mr-1" />
                {UI_TEXT.scope.selectChain}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
});

// --- ProcessLandscapeMap ---

export const ProcessLandscapeMap = memo(function ProcessLandscapeMap({
  landscape,
  itemStates,
  filteredIds,
  otherItems,
  onToggle,
  onSelectChain,
  onClearChain,
  onOpenBriefing,
  isReadOnly,
}: ProcessLandscapeMapProps) {
  // Count selections across all chains in this area
  const areaSelectedCount = useMemo(() => {
    let count = 0;
    for (const state of itemStates.values()) {
      if (state.selected) count++;
    }
    return count;
  }, [itemStates]);

  return (
    <div className="border rounded-lg bg-card mb-4">
      {/* Area header */}
      <div className="px-5 py-4 border-b">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-foreground">{landscape.area}</h3>
          <span className="text-xs text-muted-foreground">
            {areaSelectedCount} selected
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          {landscape.businessDescription}
        </p>
      </div>

      {/* Chains */}
      <div className="px-5 py-4 space-y-5 divide-y">
        {landscape.chains.map((chain, idx) => (
          <div key={chain.key} className={idx > 0 ? "pt-5" : ""}>
            <ProcessChainRow
              chain={chain}
              itemStates={itemStates}
              filteredIds={filteredIds}
              onToggle={onToggle}
              onSelectChain={onSelectChain}
              onClearChain={onClearChain}
              onOpenBriefing={onOpenBriefing}
              isReadOnly={isReadOnly}
            />
          </div>
        ))}
      </div>

      {/* Other items not in any chain */}
      {otherItems.length > 0 && (
        <div className="px-5 py-4 border-t bg-muted/30">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">
            {UI_TEXT.scope.otherItems}
          </h4>
          <div className="flex flex-wrap gap-2">
            {otherItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border bg-card text-xs ${
                  filteredIds.size > 0 && !filteredIds.has(item.id) ? "opacity-40" : ""
                }`}
              >
                <Checkbox
                  checked={item.selected}
                  onCheckedChange={() => onToggle(item.id)}
                  aria-label={`Select ${item.nameClean}`}
                  className="h-3.5 w-3.5"
                />
                <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">
                  {item.id}
                </Badge>
                <span className="text-foreground font-medium">{item.nameClean}</span>
                {onOpenBriefing && (
                  <button
                    onClick={() => onOpenBriefing(item.id)}
                    className="p-0.5 text-muted-foreground/50 hover:text-blue-500 transition-colors"
                    aria-label={`View briefing for ${item.nameClean}`}
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
