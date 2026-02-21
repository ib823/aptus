"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProgressBar } from "@/components/shared/ProgressBar";

interface ScopeItemNav {
  id: string;
  nameClean: string;
  totalSteps: number;
  reviewedSteps: number;
  fit: number;
  configure: number;
  gap: number;
  pending: number;
}

interface ReviewSidebarProps {
  assessmentId: string;
  scopeItems: ScopeItemNav[];
  currentScopeItemId: string | null;
  onSelectScopeItem: (id: string) => void;
  overallProgress: {
    totalSteps: number;
    reviewedSteps: number;
    fit: number;
    configure: number;
    gap: number;
    na: number;
    pending: number;
  };
  hideRepetitive: boolean;
  onToggleRepetitive: () => void;
}

export function ReviewSidebar({
  assessmentId,
  scopeItems,
  currentScopeItemId,
  onSelectScopeItem,
  overallProgress,
  hideRepetitive,
  onToggleRepetitive,
}: ReviewSidebarProps) {
  return (
    <div className="hidden sm:flex sm:w-[280px] bg-muted/40 border-r border flex-col h-screen fixed left-0 top-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border">
        <Link
          href={`/assessment/${assessmentId}/scope`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Scope
        </Link>
        <ProgressBar value={overallProgress.reviewedSteps} max={overallProgress.totalSteps} />
        <p className="text-xs text-muted-foreground mt-1.5">
          {overallProgress.reviewedSteps} / {overallProgress.totalSteps} steps
        </p>
      </div>

      {/* Scope Item List */}
      <div className="flex-1 overflow-y-auto py-2">
        {scopeItems.map((item) => {
          const percent = item.totalSteps > 0
            ? Math.round((item.reviewedSteps / item.totalSteps) * 100)
            : 0;

          return (
            <button
              key={item.id}
              onClick={() => onSelectScopeItem(item.id)}
              className={`w-full text-left px-4 py-3 transition-colors ${
                currentScopeItemId === item.id
                  ? "bg-card border-l-2 border-blue-500"
                  : "hover:bg-accent border-l-2 border-transparent"
              }`}
            >
              <p className="text-sm font-medium text-foreground truncate">{item.nameClean}</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1">
                  <div className="h-1 rounded-full bg-muted">
                    <div
                      className="h-1 rounded-full bg-blue-500 transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground/60 shrink-0">
                  {item.reviewedSteps}/{item.totalSteps}
                </span>
              </div>
              {/* Status dots */}
              <div className="flex items-center gap-1.5 mt-1.5">
                {item.fit > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-green-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    {item.fit}
                  </span>
                )}
                {item.configure > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-blue-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    {item.configure}
                  </span>
                )}
                {item.gap > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-amber-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    {item.gap}
                  </span>
                )}
                {item.pending > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
                    {item.pending}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={hideRepetitive}
            onChange={onToggleRepetitive}
            className="rounded border"
          />
          Hide login/access steps
        </label>
        <div className="mt-3 space-y-1">
          <StatRow label="FIT" count={overallProgress.fit} color="bg-green-500" />
          <StatRow label="CONFIGURE" count={overallProgress.configure} color="bg-blue-500" />
          <StatRow label="GAP" count={overallProgress.gap} color="bg-amber-500" />
          <StatRow label="N/A" count={overallProgress.na} color="bg-muted-foreground/60" />
          <StatRow label="PENDING" count={overallProgress.pending} color="bg-muted" />
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="font-medium text-foreground">{count}</span>
    </div>
  );
}
