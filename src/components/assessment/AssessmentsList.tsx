"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDistanceToNow } from "date-fns";

interface AssessmentData {
  id: string;
  companyName: string;
  industry: string;
  country: string | null;
  status: string;
  updatedAt: string;
  _count: {
    scopeSelections: number;
    stepResponses: number;
    stakeholders: number;
  };
}

interface AssessmentsListProps {
  assessments: AssessmentData[];
}

const STATUS_OPTIONS = ["All", "draft", "scoping", "in_review", "tracking", "completed"] as const;

export function AssessmentsList({ assessments }: AssessmentsListProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return assessments.filter((a) => {
      if (statusFilter !== "All" && a.status !== statusFilter) return false;
      if (q && !a.companyName.toLowerCase().includes(q) && !a.industry.toLowerCase().includes(q) && !(a.country ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [assessments, search, statusFilter]);

  return (
    <div className="space-y-3">
      {/* Search and filter bar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by company, industry, or country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                statusFilter === status
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:bg-muted"
              }`}
            >
              {status === "All" ? "All" : status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No assessments match your search.
        </p>
      ) : (
        filtered.map((assessment) => {
          const completionPct =
            assessment._count.scopeSelections > 0 && assessment._count.stepResponses > 0
              ? Math.min(100, Math.round((assessment._count.stepResponses / (assessment._count.scopeSelections * 15)) * 100))
              : 0;
          return (
            <Link
              key={assessment.id}
              href={assessment.status === "draft" ? `/assessment/${assessment.id}/profile` : `/assessment/${assessment.id}/scope`}
              className="block"
            >
              <Card className="hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <StatusBadge status={assessment.status} />
                    <h3 className="font-semibold text-base text-foreground">
                      {assessment.companyName}
                    </h3>
                  </div>
                  <div className="text-sm text-muted-foreground mb-3">
                    {assessment.industry}
                    {assessment.country && <> &middot; {assessment.country}</>}
                    {" "}&middot;{" "}
                    {formatDistanceToNow(new Date(assessment.updatedAt), { addSuffix: true })}
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"
                      title={`${completionPct}% complete`}
                    >
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${completionPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {completionPct}%
                    </span>
                    <span className="text-xs text-muted-foreground/60 flex-shrink-0 hidden sm:inline">
                      {assessment._count.scopeSelections} scope items &middot; {assessment._count.stepResponses} steps
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
