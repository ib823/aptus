import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

export const metadata: Metadata = { title: "Assessments" };
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { UI_TEXT } from "@/constants/ui-text";
import { redirect } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

export default async function AssessmentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Fetch assessments based on user role
  const whereClause = user.organizationId
    ? { organizationId: user.organizationId, deletedAt: null }
    : (["platform_admin", "admin", "consultant", "partner_lead"].includes(user.role))
      ? { deletedAt: null }
      : { deletedAt: null, stakeholders: { some: { userId: user.id } } };

  const assessments = await prisma.assessment.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      companyName: true,
      industry: true,
      country: true,
      status: true,
      updatedAt: true,
      _count: {
        select: {
          scopeSelections: { where: { selected: true } },
          stepResponses: true,
          stakeholders: true,
        },
      },
    },
  });

  const canCreate = ["consultant", "platform_admin", "admin", "partner_lead"].includes(user.role);

  return (
    <>
      <PageHeader
        title={UI_TEXT.assessment.listTitle}
        actions={
          canCreate ? (
            <Link href="/assessments/new">
              <Button>
                <Plus className="w-4 h-4 mr-1.5" />
                {UI_TEXT.assessment.createNew}
              </Button>
            </Link>
          ) : undefined
        }
      />

      {assessments.length === 0 ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
            <h3 className="text-base font-semibold text-blue-900 mb-1">
              Welcome to aptus
            </h3>
            <p className="text-sm text-blue-800 mb-3">
              This tool helps you compare your business processes with SAP S/4HANA. Here&apos;s how it works:
            </p>
            <ol className="text-sm text-blue-700 space-y-1.5 ml-4 list-decimal">
              <li><strong>Tell us about your company</strong> &mdash; Fill in your company profile and industry</li>
              <li><strong>Choose relevant processes</strong> &mdash; Select which SAP business areas apply to you</li>
              <li><strong>Review the fit</strong> &mdash; For each process step, tell us if SAP matches how you work</li>
            </ol>
            <p className="text-sm text-blue-700 mt-3">
              Most users complete scope selection in 10-15 minutes. Your progress saves automatically.
            </p>
          </div>
          <EmptyState
            title={UI_TEXT.assessment.noAssessments}
            description={UI_TEXT.assessment.noAssessmentsDescription}
            action={
              canCreate ? (
                <Link href="/assessments/new">
                  <Button>
                    <Plus className="w-4 h-4 mr-1.5" />
                    {UI_TEXT.assessment.createNew}
                  </Button>
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map((assessment) => {
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
                    {/* Row 1: Status + Name */}
                    <div className="flex items-start gap-2 mb-2">
                      <StatusBadge status={assessment.status} />
                      <h3 className="font-semibold text-base text-foreground">
                        {assessment.companyName}
                      </h3>
                    </div>

                    {/* Row 2: Metadata */}
                    <div className="text-sm text-muted-foreground mb-3">
                      {assessment.industry}
                      {assessment.country && <> &middot; {assessment.country}</>}
                      {" "}&middot;{" "}
                      {formatDistanceToNow(assessment.updatedAt, { addSuffix: true })}
                    </div>

                    {/* Row 3: Progress */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
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
          })}
        </div>
      )}
    </>
  );
}
