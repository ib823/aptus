import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getScopeItemCount } from "@/lib/db/cached-queries";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/shared/LoadingSkeleton";
import { RecentActivityPanel } from "@/components/dashboard/RecentActivityPanel";
import { UI_TEXT } from "@/constants/ui-text";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const whereClause = user.organizationId
    ? { organizationId: user.organizationId, deletedAt: null }
    : { deletedAt: null };

  const [assessments, totalScopeItems] = await Promise.all([
    prisma.assessment.findMany({
      where: whereClause,
      orderBy: { updatedAt: "desc" },
      include: {
        stakeholders: {
          select: { id: true, name: true, role: true },
          take: 5,
        },
        _count: {
          select: {
            scopeSelections: { where: { selected: true } },
            stepResponses: true,
            gapResolutions: true,
            stakeholders: true,
          },
        },
      },
    }),
    getScopeItemCount(),
  ]);

  if (assessments.length === 0) {
    return (
      <>
        <PageHeader title={UI_TEXT.nav.dashboard} />
        <EmptyState
          title={UI_TEXT.assessment.noAssessments}
          description={UI_TEXT.assessment.noAssessmentsDescription}
        />
      </>
    );
  }

  const assessmentIds = assessments.map((a) => a.id);

  return (
    <>
      <PageHeader title={UI_TEXT.nav.dashboard} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assessment Cards */}
        <div className="lg:col-span-2 space-y-4">
          {assessments.map((assessment) => {
            const selectedCount = assessment._count.scopeSelections;
            const reviewedCount = assessment._count.stepResponses;

            return (
              <Card key={assessment.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {assessment.companyName}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {assessment.industry} &middot; {assessment.country}
                      </p>
                    </div>
                    <StatusBadge status={assessment.status} />
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Scope Selection</span>
                        <span className="text-muted-foreground">
                          {selectedCount} / {totalScopeItems}
                        </span>
                      </div>
                      <ProgressBar value={selectedCount} max={totalScopeItems} />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Steps Reviewed</span>
                        <span className="text-muted-foreground">{reviewedCount}</span>
                      </div>
                      <ProgressBar value={reviewedCount} max={Math.max(reviewedCount, 1)} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-3 border-t">
                    {assessment.stakeholders.slice(0, 5).map((s) => (
                      <div
                        key={s.id}
                        className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary"
                        title={s.name}
                      >
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {assessment._count.stakeholders > 5 && (
                      <span className="text-xs text-muted-foreground">
                        +{assessment._count.stakeholders - 5} more
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent Activity — streams independently */}
        <div>
          <Suspense fallback={<CardSkeleton />}>
            <RecentActivityPanel assessmentIds={assessmentIds} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
