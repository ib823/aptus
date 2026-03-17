import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getDefaultWidgets } from "@/lib/dashboard/widgets";
import { UI_TEXT } from "@/constants/ui-text";
import type { UserRole } from "@/types/assessment";
import type { WidgetConfig, WidgetType } from "@/types/dashboard";

async function loadWidgets(userId: string, role: UserRole): Promise<WidgetConfig[]> {
  const dbWidgets = await prisma.dashboardWidget.findMany({
    where: { userId },
    orderBy: { position: "asc" },
  });

  if (dbWidgets.length > 0) {
    return dbWidgets.map((w) => ({
      widgetType: w.widgetType as WidgetType,
      position: w.position,
      isVisible: w.isVisible,
    }));
  }

  // Auto-create defaults for first visit
  const defaults = getDefaultWidgets(role);
  await prisma.dashboardWidget.createMany({
    data: defaults.map((w, i) => ({
      userId,
      widgetType: w.widgetType,
      position: i,
      isVisible: true,
    })),
  });
  return defaults;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = user.role as UserRole;

  const whereClause = user.organizationId
    ? { organizationId: user.organizationId, deletedAt: null }
    : { deletedAt: null };

  const [widgets, assessments] = await Promise.all([
    loadWidgets(user.id, role),
    prisma.assessment.findMany({
      where: whereClause,
      orderBy: { updatedAt: "desc" },
      select: { id: true, companyName: true },
      take: 1,
    }),
  ]);

  const primaryAssessmentId = assessments[0]?.id ?? null;

  const canCreate = ["consultant", "platform_admin", "admin", "partner_lead"].includes(role);

  if (assessments.length === 0) {
    return (
      <>
        <PageHeader title={UI_TEXT.nav.dashboard} />
        <EmptyState
          title={UI_TEXT.assessment.noAssessments}
          description={UI_TEXT.assessment.noAssessmentsDescription}
          action={
            canCreate ? (
              <a href="/assessments">
                <Button>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Create your first assessment
                </Button>
              </a>
            ) : undefined
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title={UI_TEXT.nav.dashboard} />
      <DashboardShell initialWidgets={widgets} assessmentId={primaryAssessmentId} />
    </>
  );
}
