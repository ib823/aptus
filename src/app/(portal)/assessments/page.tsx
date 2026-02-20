import Link from "next/link";
import { Plus } from "lucide-react";
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
    : (user.role === "admin" || user.role === "consultant")
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

  const canCreate = user.role === "consultant" || user.role === "admin";

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
              href={`/assessment/${assessment.id}/scope`}
            >
              <Card className="hover:shadow-md hover:border-blue-200 transition-all duration-200 cursor-pointer">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-950">
                        {assessment.companyName}
                      </h3>
                      <p className="text-sm text-gray-600 mt-0.5">
                        {assessment.industry} &middot; {assessment.country}
                      </p>
                    </div>
                    <StatusBadge status={assessment.status} />
                  </div>
                  <div className="flex items-center gap-6 mt-4 text-sm text-gray-500">
                    <span>
                      {assessment._count.scopeSelections} scope items selected
                    </span>
                    <span>
                      {assessment._count.stepResponses} steps reviewed
                    </span>
                    <span>
                      {assessment._count.stakeholders} team members
                    </span>
                    <span className="ml-auto">
                      Updated {formatDistanceToNow(assessment.updatedAt, { addSuffix: true })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
