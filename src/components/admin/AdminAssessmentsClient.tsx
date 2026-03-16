"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Calendar } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
  };
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-50 text-slate-500",
  in_progress: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  reviewed: "bg-purple-50 text-purple-700",
  signed_off: "bg-emerald-50 text-emerald-700",
};

export function AdminAssessmentsClient({ assessments, pagination }: AdminAssessmentsClientProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; companyName: string } | null>(null);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return assessments;
    return assessments.filter((a) => a.status === statusFilter);
  }, [assessments, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize));
  const startItem = pagination.totalCount === 0
    ? 0
    : (pagination.page - 1) * pagination.pageSize + 1;
  const endItem = Math.min(
    pagination.totalCount,
    startItem + assessments.length - 1,
  );

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
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">All Assessments</h1>
          <p className="mt-1 text-base text-muted-foreground">View assessments across all clients</p>
        </div>
        <Select
          value={statusFilter}
          onValueChange={(val) => setStatusFilter(val)}
        >
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{`All Status (${assessments.length})`}</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="signed_off">Signed Off</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-card border rounded-lg p-12 text-center text-muted-foreground/60 border-dashed">
          No assessments found matching the criteria.
        </div>
      ) : (
        <>
          {/* Desktop View Table */}
          <div className="hidden md:block bg-card border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Industry</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Scope</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Steps</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Gaps</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Updated</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/assessment/${a.id}/scope`} className="text-blue-600 hover:underline">
                        {a.companyName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.industry}</td>
                    <td className="px-4 py-3">
                      <Badge className={`text-xs ${STATUS_COLORS[a.status] ?? "bg-muted"}`}>
                        {a.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a._count.scopeSelections}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a._count.stepResponses}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a._count.gapResolutions}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground/60">
                      {new Date(a.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={deleting === a.id}
                        onClick={() => setDeleteTarget({ id: a.id, companyName: a.companyName })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {filtered.map((a) => (
              <div key={a.id} className="bg-card border rounded-lg p-4 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <Link href={`/assessment/${a.id}/scope`} className="text-lg font-bold text-blue-600">
                      {a.companyName}
                    </Link>
                    <p className="text-sm text-muted-foreground">{a.industry} &middot; {a.country}</p>
                  </div>
                  <Badge className={`text-xs ${STATUS_COLORS[a.status] ?? "bg-muted"}`}>
                    {a.status.replace("_", " ")}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 py-3 border-y">
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground">{a._count.scopeSelections}</p>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Scope</p>
                  </div>
                  <div className="text-center border-x">
                    <p className="text-lg font-bold text-foreground">{a._count.stepResponses}</p>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Steps</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-foreground">{a._count.gapResolutions}</p>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Gaps</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Updated {new Date(a.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  </div>
                  <Button
                    variant="ghost"
                    className="text-red-600 h-11 px-4 -mr-2"
                    disabled={deleting === a.id}
                    onClick={() => setDeleteTarget({ id: a.id, companyName: a.companyName })}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="text-xs text-muted-foreground/60 mt-4 text-center md:text-left">
        Showing {startItem}-{endItem} of {pagination.totalCount} assessments
      </p>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Filtered view: {filtered.length} on this page
        </span>
        <div className="flex items-center gap-2">
          {pagination.page > 1 ? (
            <Link
              href={`/admin/assessments?page=${pagination.page - 1}`}
              className="px-3 py-1.5 border rounded-md hover:bg-accent text-foreground"
            >
              Previous
            </Link>
          ) : (
            <span className="px-3 py-1.5 border rounded-md opacity-40 cursor-not-allowed">
              Previous
            </span>
          )}
          <span className="text-xs">
            Page {pagination.page} of {totalPages}
          </span>
          {pagination.page < totalPages ? (
            <Link
              href={`/admin/assessments?page=${pagination.page + 1}`}
              className="px-3 py-1.5 border rounded-md hover:bg-accent text-foreground"
            >
              Next
            </Link>
          ) : (
            <span className="px-3 py-1.5 border rounded-md opacity-40 cursor-not-allowed">
              Next
            </span>
          )}
        </div>
      </div>
      
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
