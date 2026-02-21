import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { UI_TEXT } from "@/constants/ui-text";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const whereClause = user.organizationId
    ? { organizationId: user.organizationId, deletedAt: null }
    : { deletedAt: null };

  const assessments = await prisma.assessment.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    include: {
      stakeholders: {
        select: {
          id: true,
          name: true,
          role: true,
          assignedAreas: true,
          lastActiveAt: true,
        },
      },
      _count: {
        select: {
          scopeSelections: { where: { selected: true } },
          stepResponses: true,
          gapResolutions: true,
        },
      },
    },
  });

  // Get recent activity
  const assessmentIds = assessments.map((a) => a.id);
  const recentActivity = assessmentIds.length > 0
    ? await prisma.decisionLogEntry.findMany({
        where: { assessmentId: { in: assessmentIds } },
        orderBy: { timestamp: "desc" },
        take: 15,
        select: {
          id: true,
          action: true,
          actor: true,
          actorRole: true,
          timestamp: true,
          entityType: true,
          assessment: { select: { companyName: true } },
        },
      })
    : [];

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

  return (
    <>
      <PageHeader title={UI_TEXT.nav.dashboard} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assessment Cards */}
        <div className="lg:col-span-2 space-y-4">
          {assessments.map((assessment) => {
            const totalScopeItems = 560; // from ingested data
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
                    {assessment.stakeholders.length > 5 && (
                      <span className="text-xs text-muted-foreground">
                        +{assessment.stakeholders.length - 5} more
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Recent Activity */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet</p>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0" />
                      <div>
                        <p className="text-sm text-foreground">
                          <span className="font-medium">{entry.actor}</span>
                          {" "}
                          {entry.action.toLowerCase().replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-muted-foreground/60">
                          {formatDistanceToNow(entry.timestamp, { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
