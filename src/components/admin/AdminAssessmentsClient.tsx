"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface AssessmentRow {
  id: string;
  companyName: string;
  industry: string;
  country: string;
  companySize: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    scopeSelections: number;
    stepResponses: number;
    gapResolutions: number;
    stakeholders: number;
  };
}

interface AdminAssessmentsClientProps {
  assessments: AssessmentRow[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  reviewed: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  signed_off: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

export function AdminAssessmentsClient({ assessments }: AdminAssessmentsClientProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return assessments;
    return assessments.filter((a) => a.status === statusFilter);
  }, [assessments, statusFilter]);

  return (
    <div className="max-w-5xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">All Assessments</h1>
          <p className="mt-1 text-base text-muted-foreground">View assessments across all clients</p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded-md px-3 py-1.5 text-sm bg-background"
        >
          <option value="all">All Status ({assessments.length})</option>
          <option value="draft">Draft</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="reviewed">Reviewed</option>
          <option value="signed_off">Signed Off</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border rounded-lg p-8 text-center text-muted-foreground/60">
          No assessments found.
        </div>
      ) : (
        <div className="bg-card border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Company</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Industry</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Scope</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Steps</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Gaps</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b border-border/50 hover:bg-accent">
                  <td className="px-4 py-2.5">
                    <Link href={`/assessment/${a.id}/scope`} className="text-blue-600 hover:underline font-medium">
                      {a.companyName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.industry}</td>
                  <td className="px-4 py-2.5">
                    <Badge className={`text-xs ${STATUS_COLORS[a.status] ?? "bg-muted"}`}>
                      {a.status.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a._count.scopeSelections}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a._count.stepResponses}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a._count.gapResolutions}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground/60">
                    {new Date(a.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground/60 mt-2">{filtered.length} of {assessments.length} assessments</p>
    </div>
  );
}
