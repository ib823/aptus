"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

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
  draft: "bg-slate-50 text-slate-500",
  in_progress: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  reviewed: "bg-purple-50 text-purple-700",
  signed_off: "bg-emerald-50 text-emerald-700",
};

export function AdminAssessmentsClient({ assessments }: AdminAssessmentsClientProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; companyName: string } | null>(null);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return assessments;
    return assessments.filter((a) => a.status === statusFilter);
  }, [assessments, statusFilter]);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/assessments/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        alert("Failed to delete assessment. Please try again.");
      }
    } catch {
      alert("Failed to delete assessment");
    } finally {
      setDeleting(null);
      setDeleteTarget(null);
    }
  }, [router]);

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
              <tr className="bg-muted border-b">
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Company</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Industry</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Scope</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Steps</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Gaps</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">Updated</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b hover:bg-muted/30">
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
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={deleting === a.id}
                      onClick={() => setDeleteTarget({ id: a.id, companyName: a.companyName })}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground/60 mt-2">{filtered.length} of {assessments.length} assessments</p>
      
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete Assessment"
        description={`Are you sure you want to delete the assessment for "${deleteTarget?.companyName}"? This action soft-deletes the record.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) {
            void handleDelete(deleteTarget.id);
          }
        }}
      />
    </div>
  );
}
