"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { GapCard } from "@/components/gaps/GapCard";
import { GapSummary } from "@/components/gaps/GapSummary";
import { EmptyState } from "@/components/shared/EmptyState";

interface GapData {
  id: string;
  gapDescription: string;
  resolutionType: string;
  resolutionDescription: string;
  effortDays: number | null;
  costEstimate: Record<string, unknown> | null;
  riskLevel: string | null;
  upgradeImpact: string | null;
  rationale: string | null;
  clientApproved: boolean;
  processStep: {
    id: string;
    actionTitle: string;
    sequence: number;
    processFlowGroup: string | null;
  } | null;
  scopeItem: {
    id: string;
    nameClean: string;
    functionalArea: string;
  } | null;
  clientNote: string | null;
}

interface GapResolutionClientProps {
  assessmentId: string;
  assessmentStatus: string;
  initialGaps: GapData[];
}

export function GapResolutionClient({
  assessmentId,
  assessmentStatus,
  initialGaps,
}: GapResolutionClientProps) {
  const [gaps, setGaps] = useState(initialGaps);
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const isReadOnly = assessmentStatus === "signed_off" || assessmentStatus === "reviewed";

  // Get unique scope items for filtering
  const scopeItems = useMemo(() => {
    const items = new Map<string, string>();
    for (const gap of gaps) {
      if (gap.scopeItem) {
        items.set(gap.scopeItem.id, gap.scopeItem.nameClean);
      }
    }
    return Array.from(items.entries());
  }, [gaps]);

  // Apply filters
  const filteredGaps = useMemo(() => {
    let result = gaps;
    if (scopeFilter !== "all") {
      result = result.filter((g) => g.scopeItem?.id === scopeFilter);
    }
    if (typeFilter !== "all") {
      result = result.filter((g) => g.resolutionType === typeFilter);
    }
    return result;
  }, [gaps, scopeFilter, typeFilter]);

  // Derive summary from gaps
  const summary = useMemo(() => {
    const total = gaps.length;
    const resolved = gaps.filter((g) => g.resolutionType !== "PENDING").length;
    const approved = gaps.filter((g) => g.clientApproved).length;
    const totalEffort = gaps.reduce((sum, g) => sum + (g.effortDays ?? 0), 0);

    const byType = new Map<string, number>();
    for (const gap of gaps) {
      byType.set(gap.resolutionType, (byType.get(gap.resolutionType) ?? 0) + 1);
    }

    return {
      total,
      resolved,
      approved,
      pending: total - resolved,
      totalEffort,
      byType: Object.fromEntries(byType) as Record<string, number>,
    };
  }, [gaps]);

  const handleUpdate = useCallback(
    async (gapId: string, data: {
      resolutionType: string;
      resolutionDescription?: string | undefined;
      effortDays?: number | undefined;
      riskLevel?: string | undefined;
      rationale?: string | undefined;
    }) => {
      // Optimistic update
      setGaps((prev) =>
        prev.map((g) =>
          g.id === gapId
            ? {
                ...g,
                resolutionType: data.resolutionType,
                resolutionDescription: data.resolutionDescription ?? g.resolutionDescription,
                effortDays: data.effortDays ?? g.effortDays,
                riskLevel: data.riskLevel ?? g.riskLevel,
                rationale: data.rationale ?? g.rationale,
              }
            : g,
        ),
      );

      // Persist
      try {
        await fetch(`/api/assessments/${assessmentId}/gaps/${gapId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } catch {
        // Silently fail — user can retry
      }
    },
    [assessmentId],
  );

  return (
    <div className="flex gap-8">
      {/* Sidebar summary */}
      <div className="hidden sm:block w-[280px] shrink-0">
        <div className="sticky top-8">
          <GapSummary
            total={summary.total}
            resolved={summary.resolved}
            pending={summary.pending}
            totalEffort={summary.totalEffort}
            byType={summary.byType}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 max-w-4xl">
        <PageHeader
          title="Gap Resolution"
          description={`${summary.total} gaps identified — resolve each one with a recommended approach.`}
        />

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700"
          >
            <option value="all">All Scope Items</option>
            {scopeItems.map(([id, name]) => (
              <option key={id} value={id}>
                {id} — {name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 px-3 text-xs border border-gray-200 rounded-md bg-white text-gray-700"
          >
            <option value="all">All Types</option>
            <option value="PENDING">Pending</option>
            <option value="FIT">Fits After All</option>
            <option value="CONFIGURE">Configure</option>
            <option value="KEY_USER_EXT">Key User Extension</option>
            <option value="BTP_EXT">BTP Extension</option>
            <option value="ISV">ISV Solution</option>
            <option value="CUSTOM_ABAP">Custom ABAP</option>
            <option value="ADAPT_PROCESS">Adapt Process</option>
            <option value="OUT_OF_SCOPE">Out of Scope</option>
          </select>
        </div>

        {/* Gap cards */}
        {filteredGaps.length === 0 ? (
          <EmptyState
            title="No gaps to resolve"
            description={gaps.length === 0
              ? "No gaps have been identified yet. Complete the process review first."
              : "No gaps match your current filters."
            }
          />
        ) : (
          <div className="space-y-4">
            {filteredGaps.map((gap) => (
              <GapCard
                key={gap.id}
                gap={gap}
                onUpdate={handleUpdate}
                isReadOnly={isReadOnly}
              />
            ))}
          </div>
        )}

        {/* Action bar */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200">
          <Link href={`/assessment/${assessmentId}/review`}>
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back to Process Review
            </Button>
          </Link>

          <div className="text-center">
            <p className="text-base font-semibold text-gray-950">
              {summary.resolved} of {summary.total} gaps resolved
            </p>
            <p className="text-sm text-gray-600">
              {summary.totalEffort} total effort days
            </p>
          </div>

          <Link href={`/assessment/${assessmentId}/config`}>
            <Button>
              Continue to Config Matrix
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
