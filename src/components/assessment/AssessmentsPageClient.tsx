"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { AssessmentsList } from "@/components/assessment/AssessmentsList";
import { CoreEdgeDialog } from "@/components/templates/CoreEdgeDialog";
import { UI_TEXT } from "@/constants/ui-text";

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

interface AssessmentsPageClientProps {
  assessments: AssessmentData[];
  canCreate: boolean;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
  };
}

export function AssessmentsPageClient({
  assessments,
  canCreate,
  pagination,
}: AssessmentsPageClientProps) {
  const router = useRouter();
  const [coreEdgeOpen, setCoreEdgeOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const totalPages = Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize));
  const startItem = pagination.totalCount === 0
    ? 0
    : (pagination.page - 1) * pagination.pageSize + 1;
  const endItem = Math.min(
    pagination.totalCount,
    startItem + assessments.length - 1,
  );

  const handleCoreEdgeSubmit = async (data: {
    companyName: string;
    industry: string;
    country: string;
    companySize: string;
  }) => {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/assessments/from-preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: "coreedge", ...data }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Failed to create assessment");
      }
      const { data: assessment } = await res.json();
      setCoreEdgeOpen(false);
      router.push(`/assessment/${assessment.id}/scope`);
    } catch (err) {
      console.error("CoreEdge creation failed:", err);
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={UI_TEXT.assessment.listTitle}
        actions={
          canCreate ? (
            <>
              <Button
                variant="outline"
                onClick={() => setCoreEdgeOpen(true)}
              >
                <Zap className="w-4 h-4 mr-1.5" />
                ABeam CoreEdge
              </Button>
              <a href="/assessments/new">
                <Button>
                  <Plus className="w-4 h-4 mr-1.5" />
                  {UI_TEXT.assessment.createNew}
                </Button>
              </a>
            </>
          ) : undefined
        }
      />

      {assessments.length === 0 ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
            <h3 className="text-base font-semibold text-blue-900 mb-1">
              Welcome to ABeam
            </h3>
            <p className="text-sm text-blue-800 mb-3">
              This tool helps you compare your business processes with SAP.
              Here&apos;s how it works:
            </p>
            <ol className="text-sm text-blue-700 space-y-1.5 ml-4 list-decimal">
              <li>
                <strong>Tell us about your company</strong> &mdash; Fill in your
                company profile and industry
              </li>
              <li>
                <strong>Choose relevant processes</strong> &mdash; Select which
                SAP business areas apply to you
              </li>
              <li>
                <strong>Review the fit</strong> &mdash; For each process step,
                tell us if SAP matches how you work
              </li>
            </ol>
            <p className="text-sm text-blue-700 mt-3">
              Most users complete scope selection in 10-15 minutes. Your progress
              saves automatically.
            </p>
          </div>

          <EmptyState
            title={UI_TEXT.assessment.noAssessments}
            description={UI_TEXT.assessment.noAssessmentsDescription}
            action={
              canCreate ? (
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setCoreEdgeOpen(true)}
                  >
                    <Zap className="w-4 h-4 mr-1.5" />
                    Quick Start — ABeam CoreEdge
                  </Button>
                  <a href="/assessments/new">
                    <Button>
                      <Plus className="w-4 h-4 mr-1.5" />
                      {UI_TEXT.assessment.createNew}
                    </Button>
                  </a>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <AssessmentsList assessments={assessments} />
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {startItem}-{endItem} of {pagination.totalCount}
            </span>
            <div className="flex items-center gap-2">
              {pagination.page > 1 ? (
                <a
                  href={`/assessments?page=${pagination.page - 1}`}
                  className="px-3 py-1.5 border rounded-md hover:bg-accent text-foreground"
                >
                  Previous
                </a>
              ) : (
                <span className="px-3 py-1.5 border rounded-md opacity-40 cursor-not-allowed">
                  Previous
                </span>
              )}
              <span className="text-xs">
                Page {pagination.page} of {totalPages}
              </span>
              {pagination.page < totalPages ? (
                <a
                  href={`/assessments?page=${pagination.page + 1}`}
                  className="px-3 py-1.5 border rounded-md hover:bg-accent text-foreground"
                >
                  Next
                </a>
              ) : (
                <span className="px-3 py-1.5 border rounded-md opacity-40 cursor-not-allowed">
                  Next
                </span>
              )}
            </div>
          </div>
        </>
      )}

      <CoreEdgeDialog
        open={coreEdgeOpen}
        onOpenChange={setCoreEdgeOpen}
        onSubmit={handleCoreEdgeSubmit}
        isSubmitting={isSubmitting}
      />
    </>
  );
}
