"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DeltaSummary } from "@/types/lifecycle";

interface DeltaSummaryCardsProps {
  summary: DeltaSummary;
  className?: string | undefined;
}

interface StatCardProps {
  label: string;
  added: number;
  removed: number;
  modified: number;
}

function StatCard({ label, added, removed, modified }: StatCardProps) {
  const total = added + removed + modified;
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{total}</p>
        <div className="mt-2 flex gap-3 text-xs">
          {added > 0 ? <span className="text-green-600">+{added}</span> : null}
          {removed > 0 ? <span className="text-red-600">-{removed}</span> : null}
          {modified > 0 ? <span className="text-blue-600">~{modified}</span> : null}
          {total === 0 ? <span className="text-muted-foreground">No changes</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function DeltaSummaryCards({ summary, className }: DeltaSummaryCardsProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 md:grid-cols-4", className)}>
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-muted-foreground">Total Changes</p>
          <p className="mt-1 text-2xl font-bold">{summary.totalChanges}</p>
        </CardContent>
      </Card>
      <StatCard
        label="Scope"
        added={summary.scopeAdded}
        removed={summary.scopeRemoved}
        modified={summary.scopeModified}
      />
      <StatCard
        label="Classifications"
        added={summary.classificationsChanged}
        removed={0}
        modified={0}
      />
      <StatCard
        label="Gap Resolutions"
        added={summary.gapResolutionsAdded}
        removed={summary.gapResolutionsRemoved}
        modified={summary.gapResolutionsModified}
      />
    </div>
  );
}
