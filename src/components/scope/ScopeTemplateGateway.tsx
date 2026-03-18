"use client";

import { Zap, Building2, List, ArrowRight } from "lucide-react";
import { PRESETS } from "@/constants/presets";

const coreEdge = PRESETS.coreedge;

interface ScopeTemplateGatewayProps {
  industry: string;
  industryPreSelectCount: number;
  totalScopeItems: number;
  onApplyIndustryTemplate: () => void;
  onApplyCoreEdge: () => void;
  onSkipToFullCatalog: () => void;
  isApplying: boolean;
}

export function ScopeTemplateGateway({
  industry,
  industryPreSelectCount,
  totalScopeItems,
  onApplyIndustryTemplate,
  onApplyCoreEdge,
  onSkipToFullCatalog,
  isApplying,
}: ScopeTemplateGatewayProps) {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-semibold text-foreground mb-2">
          Choose Your Starting Point
        </h1>
        <p className="text-base text-muted-foreground">
          Pick a template with pre-selected scope items, or browse the full catalog.
        </p>
      </div>

      <div className="grid gap-4">
        {/* CoreEdge template */}
        {coreEdge && (
          <button
            onClick={onApplyCoreEdge}
            disabled={isApplying}
            className="w-full flex items-start gap-5 p-6 rounded-xl border-2 border-primary/20 bg-primary/5 hover:border-primary/40 hover:bg-primary/10 transition-all text-left disabled:opacity-50"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-lg font-semibold text-foreground">{coreEdge.name}</p>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-primary/10 text-primary rounded-full">
                  Recommended
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {coreEdge.description}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {coreEdge.scopeItems.filter((s) => s.defaultSelected).map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-background border"
                  >
                    <span className="text-muted-foreground">{s.id}</span>
                    <span className="text-foreground">{s.name}</span>
                  </span>
                ))}
                {coreEdge.scopeItems.filter((s) => !s.defaultSelected).length > 0 && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{coreEdge.scopeItems.filter((s) => !s.defaultSelected).length} optional
                  </span>
                )}
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
          </button>
        )}

        {/* Industry template */}
        {industryPreSelectCount > 0 && (
          <button
            onClick={onApplyIndustryTemplate}
            disabled={isApplying}
            className="w-full flex items-start gap-5 p-6 rounded-xl border-2 border-border hover:border-primary/30 hover:bg-muted/30 transition-all text-left disabled:opacity-50"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Building2 className="h-6 w-6 text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold text-foreground mb-1">
                {industry} Industry Template
              </p>
              <p className="text-sm text-muted-foreground">
                {industryPreSelectCount} scope items pre-selected based on {industry} industry best practices. Review and adjust after applying.
              </p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
          </button>
        )}

        {/* Browse full catalog */}
        <button
          onClick={onSkipToFullCatalog}
          className="w-full flex items-start gap-5 p-6 rounded-xl border-2 border-dashed border-border hover:border-muted-foreground/40 hover:bg-muted/20 transition-all text-left"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
            <List className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold text-foreground mb-1">
              Browse Full Catalog
            </p>
            <p className="text-sm text-muted-foreground">
              Start from scratch and select from all {totalScopeItems} scope items. Best for experienced consultants who know their scope.
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
        </button>
      </div>

      {isApplying && (
        <p className="text-center text-sm text-muted-foreground mt-6 animate-pulse">
          Applying template...
        </p>
      )}
    </div>
  );
}
