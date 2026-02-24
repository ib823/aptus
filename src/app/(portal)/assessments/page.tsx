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
      ) : (
        <div className="grid gap-4">
          {assessments.map((assessment) => (
            <Link
              key={assessment.id}
              href={assessment.status === "draft" ? `/assessment/${assessment.id}/profile` : `/assessment/${assessment.id}/scope`}
            >
              <Card className="hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {assessment.companyName}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {assessment.industry} &middot; {assessment.country}
                      </p>
                    </div>
                    <StatusBadge status={assessment.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground">
                    <span>
                      {assessment._count.scopeSelections} {assessment._count.scopeSelections === 1 ? "scope item" : "scope items"}
                    </span>
                    <span>
                      {assessment._count.stepResponses} {assessment._count.stepResponses === 1 ? "step" : "steps"} reviewed
                    </span>
                    <span>
                      {assessment._count.stakeholders} {assessment._count.stakeholders === 1 ? "member" : "members"}
                    </span>
                    <span className="sm:ml-auto">
                      {formatDistanceToNow(assessment.updatedAt, { addSuffix: true })}
                    </span>
                  </div>
                  {assessment._count.scopeSelections > 0 && (
                    <div className="mt-3">
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.min(100, assessment._count.stepResponses > 0 ? Math.round((assessment._count.stepResponses / (assessment._count.scopeSelections * 15)) * 100) : 0)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
